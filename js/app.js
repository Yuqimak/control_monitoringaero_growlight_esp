// ============================================
// MAIN ENTRY – app.js (FINAL - PAKE system/mode & system/state + NOTIF)
// ============================================

import { db } from './firebase.js';
import { state, currentUser, setUser, DOM, initDOM, showToast } from './modules/core.js';
import { initCharts, updateCharts, exportData, exportPDF, loadChartHistory, loadDashChartHistory } from './modules/analytics.js';
import { renderUI, getDays, getReminder, getModeConfig, updateModeUI } from './modules/ui.js';
import { initAdminPanel } from './modules/admin.js';
import { ref, onValue, set, update, get, query, orderByKey, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// ===== SESSION CHECK =====
const sessionData = localStorage.getItem('iot_user');
if (!sessionData) {
  window.location.href = 'login.html';
} else {
  try {
    const user = JSON.parse(sessionData);
    setUser(user);
    console.log('👤 Login sebagai:', user.nama, '(', user.username, ')');
    const loginTime = user.loginTime || 0;
    if (Date.now() - loginTime > 8 * 60 * 60 * 1000) {
      localStorage.removeItem('iot_user');
      window.location.href = 'login.html';
    }
  } catch(e) {
    localStorage.removeItem('iot_user');
    window.location.href = 'login.html';
  }
}

// ===== EXPOSE GLOBAL =====
window.exportData = exportData;
window.exportPDF = exportPDF;
window.logout = function() {
  if (confirm('Yakin mau logout?')) {
    localStorage.removeItem('iot_user');
    window.location.href = 'login.html';
  }
};

// ===== STATE LISTENER =====
let unsubSensor = null;
let unsubSystem = null;
let isListenerActive = false;

// ===== THROTTLE VARIABEL =====
let lastSensorUpdate = 0;
const SENSOR_THROTTLE = 1000;
let lastSystemUpdate = 0;
const SYSTEM_THROTTLE = 2000;

// ===== RENDER DEBOUNCE =====
let renderTimeout = null;
function scheduleRender() {
  if (renderTimeout) clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => {
    renderUI();
    renderTimeout = null;
  }, 200);
}

// ============================================
// CEK KONEKSI FIREBASE & ESP32
// ============================================
let connectionCheckInterval = null;
let esp32Online = false;
let firebaseConnected = false;

function cekKoneksi() {
  try {
    const connStatus = document.getElementById('connStatus');
    if (connStatus) {
      if (connStatus.innerText === 'Realtime Connected' || connStatus.innerText === 'Online') {
        firebaseConnected = true;
        connStatus.style.color = '#22c55e';
      } else {
        firebaseConnected = false;
        connStatus.style.color = '#ef4444';
      }
    }

    const lastUpdate = document.getElementById('dashLastUpdate');
    if (lastUpdate && lastUpdate.innerText !== '--:--:--') {
      const timeStr = lastUpdate.innerText;
      const now = new Date();
      const [hours, minutes, seconds] = timeStr.split(':').map(Number);
      const lastDate = new Date();
      lastDate.setHours(hours, minutes, seconds || 0);
      
      const diffMinutes = (now - lastDate) / 60000;
      if (diffMinutes < 5) {
        esp32Online = true;
      } else {
        esp32Online = false;
      }
    } else {
      esp32Online = false;
    }

    updateConnectionNotification();

  } catch (e) {
    console.error('❌ Error cek koneksi:', e);
  }
}

function updateConnectionNotification() {
  let notif = document.getElementById('connectionNotif');
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'connectionNotif';
    notif.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      z-index: 9999;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      pointer-events: none;
      display: none;
    `;
    document.body.appendChild(notif);
  }

  if (!firebaseConnected) {
    notif.textContent = '⚠️ Firebase Disconnected';
    notif.style.background = '#ef4444';
    notif.style.color = '#fff';
    notif.style.display = 'block';
    notif.style.border = '1px solid #dc2626';
  } else if (!esp32Online) {
    notif.textContent = '⚠️ ESP32 Offline';
    notif.style.background = '#f59e0b';
    notif.style.color = '#fff';
    notif.style.display = 'block';
    notif.style.border = '1px solid #d97706';
  } else {
    notif.textContent = '✅ Sistem Online';
    notif.style.background = '#22c55e';
    notif.style.color = '#fff';
    notif.style.display = 'block';
    notif.style.border = '1px solid #16a34a';
    setTimeout(() => {
      notif.style.opacity = '0';
      setTimeout(() => {
        notif.style.display = 'none';
        notif.style.opacity = '1';
      }, 500);
    }, 5000);
  }
}

// ===== APP START =====
document.addEventListener("DOMContentLoaded", () => {
  try {
    initDOM();
    initAdminPanel();
    initCharts();
    initFirebase();
    initControls();
    initExpandChart();
    initModeControls();
    
    if (DOM.exportBtn && DOM.exportPeriod) {
      DOM.exportBtn.addEventListener('click', () => exportData(DOM.exportPeriod.value));
    }
    if (DOM.exportPdfBtn) {
      DOM.exportPdfBtn.addEventListener('click', exportPDF);
    }
    
    loadChartHistory();
    loadDashChartHistory();
    
    updateClock();
    setInterval(updateClock, 1000);
    
    if (DOM.userName) {
      DOM.userName.textContent = `👋 ${currentUser?.nama || 'User'}`;
    }
    
    setupNavigation();
    
    // 🔥 CEK KONEKSI
    cekKoneksi();
    setInterval(cekKoneksi, 30000);
    
    console.log("🚀 App siap!");
  } catch (e) {
    console.error('❌ Error saat start app:', e);
  }
});

// ============================================
// FIREBASE LISTENERS
// ============================================
function initFirebase() {
  try {
    if (isListenerActive) {
      console.log('⚠️ Listener sudah aktif, skip.');
      return;
    }
    isListenerActive = true;
    console.log('🔌 Memasang Firebase listeners...');

    // --- Sensor ---
    unsubSensor = onValue(ref(db, 'sensor'), (snap) => {
      try {
        const now = Date.now();
        if (now - lastSensorUpdate < SENSOR_THROTTLE) return;
        lastSensorUpdate = now;

        const d = snap.val();
        if (d) {
          const oldTemp = state.temperature;
          const oldLight = state.sensorLight;
          
          const rawSuhu = d.suhu || 0;
          state.temperature = (rawSuhu > 0 && rawSuhu < 60) ? rawSuhu : 25;
          
          state.sensorLight = Math.min(100, Math.round((d.cahaya || 0) / 5000 * 100));

          if (state.temperature !== oldTemp || state.sensorLight !== oldLight) {
            const time = new Date().toLocaleTimeString();
            updateCharts(time);
          }
          
          const luxThreshold = state.luxThreshold || 500;
          const rawLight = d.cahaya || 0;
          
          if (rawLight > luxThreshold) {
            const increment = 1 / 3600;
            state.accumulatedLight = (state.accumulatedLight || 0) + increment;
          }
          
          const totalNeeded = state.totalLightNeeded || 12;
          const progress = Math.min(100, Math.round((state.accumulatedLight / totalNeeded) * 100));
          if (DOM.statLightProgress) DOM.statLightProgress.textContent = progress;
          if (DOM.lightProgressDisplay) DOM.lightProgressDisplay.textContent = progress + '%';
          if (DOM.sunlightHours) DOM.sunlightHours.textContent = (state.accumulatedLight || 0).toFixed(1);
          if (DOM.growlightHours) {
            const growlight = Math.max(0, totalNeeded - (state.accumulatedLight || 0));
            DOM.growlightHours.textContent = growlight.toFixed(1);
          }
        }
        scheduleRender();
      } catch (e) {
        console.error('❌ Error di listener sensor:', e);
      }
    }, (err) => {
      console.error("❌ Sensor error:", err);
      if (DOM.connStatus) {
        DOM.connStatus.innerText = "Disconnected";
        DOM.connStatus.style.color = "#ef4444";
      }
      isListenerActive = false;
    });

    // --- System ---
    unsubSystem = onValue(ref(db, 'system'), (snap) => {
      try {
        const now = Date.now();
        if (now - lastSystemUpdate < SYSTEM_THROTTLE) return;
        lastSystemUpdate = now;

        const d = snap.val();
        if (d) {
          state.controlMode = d.mode || 'otomatis';
          state.lampState = d.state || false;
          state.forceDayOn = d.force_day_on || false;
          state.jadwalStart = d.jadwal_start || 6;
          state.jadwalEnd = d.jadwal_end || 18;
          state.luxThreshold = d.lux_threshold || 500;
          state.totalLightNeeded = d.total_light_needed || 12;
          state.accumulatedLight = d.accumulated_light || 0;
          state.lastResetDate = d.last_reset_date || '';
          state.alert = d.alert || '';
          
          const today = new Date().toISOString().slice(0,10);
          if (state.lastResetDate !== today) {
            state.accumulatedLight = 0;
            state.lastResetDate = today;
          }
          
          if (DOM.currentModeDisplay2) {
            const labels = { otomatis: '🤖 Otomatis (Lux)', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
            DOM.currentModeDisplay2.textContent = labels[state.controlMode] || state.controlMode;
          }
          
          const dashLampStatus = document.getElementById('dashLampStatus');
          if (dashLampStatus) {
            dashLampStatus.textContent = state.lampState ? 'ON' : 'OFF';
            dashLampStatus.style.color = state.lampState ? '#22c55e' : '#ef4444';
          }
          
          const lampStateText = document.getElementById('lampStateText');
          if (lampStateText) {
            lampStateText.textContent = state.lampState ? 'ON' : 'OFF';
            lampStateText.style.color = state.lampState ? '#22c55e' : '#ef4444';
          }
          
          const statLamp = document.getElementById('statLamp');
          if (statLamp) {
            statLamp.textContent = state.lampState ? 'ON' : 'OFF';
            statLamp.style.color = state.lampState ? '#22c55e' : '#ef4444';
          }
          
          if (DOM.forceDayOn) DOM.forceDayOn.checked = state.forceDayOn;
          if (DOM.luxThresholdDisplay) DOM.luxThresholdDisplay.textContent = state.luxThreshold + ' lux';
          if (DOM.luxThreshold) DOM.luxThreshold.value = state.luxThreshold;
          if (DOM.jadwalStart) DOM.jadwalStart.value = state.jadwalStart;
          if (DOM.jadwalEnd) DOM.jadwalEnd.value = state.jadwalEnd;
          if (DOM.totalLightNeeded) DOM.totalLightNeeded.value = state.totalLightNeeded;
          
          const dashLatestTemp = document.getElementById('dashLatestTemp');
          if (dashLatestTemp) {
            dashLatestTemp.textContent = state.temperature.toFixed(1) + '°C';
          }
          
          if (DOM.sunlightHours) DOM.sunlightHours.textContent = (state.accumulatedLight || 0).toFixed(1);
          if (DOM.growlightHours) {
            const growlight = Math.max(0, (state.totalLightNeeded || 12) - (state.accumulatedLight || 0));
            DOM.growlightHours.textContent = growlight.toFixed(1);
          }
          if (DOM.lightProgressDisplay || DOM.statLightProgress) {
            const progress = Math.min(100, Math.round(((state.accumulatedLight || 0) / (state.totalLightNeeded || 12)) * 100));
            const display = progress > 100 ? 100 : progress;
            if (DOM.lightProgressDisplay) DOM.lightProgressDisplay.textContent = display + '%';
            if (DOM.statLightProgress) DOM.statLightProgress.textContent = display;
          }
          
          updateModeButtonUI(state.controlMode);
        }
        scheduleRender();
      } catch (e) {
        console.error('❌ Error di listener system:', e);
      }
    }, (err) => {
      console.error("❌ System error:", err);
      isListenerActive = false;
    });
    
    if (DOM.connStatus) {
      DOM.connStatus.innerText = "Realtime Connected";
      DOM.connStatus.style.color = "#22c55e";
    }
    
  } catch (e) {
    console.error('❌ Error init Firebase:', e);
    if (DOM.connStatus) {
      DOM.connStatus.innerText = "Error";
      DOM.connStatus.style.color = "#ef4444";
    }
    isListenerActive = false;
  }
}

// ===== UNSUBSCRIBE =====
function unsubscribeAll() {
  try {
    if (unsubSensor) { unsubSensor(); unsubSensor = null; }
    if (unsubSystem) { unsubSystem(); unsubSystem = null; }
    isListenerActive = false;
    console.log('⏸️ Listener dihentikan');
  } catch (e) {
    console.error('❌ Error unsubscribe:', e);
  }
}

// ===== NAVIGASI =====
function setupNavigation() {
  try {
    const sectionsNeedingLive = ['dashboard', 'monitoring'];
    
    document.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', function(e) {
        try {
          e.preventDefault();
          document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
          this.classList.add('active');
          
          const target = this.dataset.target;
          document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
          const targetSection = document.getElementById(target);
          if (targetSection) targetSection.classList.remove('hidden');
          
          if (sectionsNeedingLive.includes(target)) {
            if (!isListenerActive) {
              initFirebase();
              console.log('🔌 Listener real-time dipasang untuk', target);
            }
          } else {
            if (isListenerActive) {
              unsubscribeAll();
              console.log('⏸️ Listener dihentikan (section', target, ')');
            }
          }
          
          if (window.innerWidth <= 768) closeMenu();
        } catch (e) {
          console.error('❌ Error klik menu:', e);
        }
      });
    });
  } catch (e) {
    console.error('❌ Error setup navigasi:', e);
  }
}

// ===== UPDATE UI TOMBOL MODE =====
function updateModeButtonUI(mode) {
  try {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.remove('active-mode');
      btn.style.background = 'rgba(255,255,255,0.05)';
      btn.style.border = '1px solid rgba(255,255,255,0.1)';
      btn.style.color = 'white';
    });
    
    const map = {
      otomatis: 'modeAutoBtn',
      jadwal: 'modeJadwalBtn',
      manual: 'modeManualBtn'
    };
    
    const activeId = map[mode];
    if (activeId) {
      const activeBtn = document.getElementById(activeId);
      if (activeBtn) {
        activeBtn.classList.add('active-mode');
        activeBtn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
        activeBtn.style.border = '1px solid #22c55e';
        activeBtn.style.color = 'white';
      }
    }
  } catch (e) {
    console.error('❌ Error update mode button:', e);
  }
}

// ============================================
// CONTROLS
// ============================================
function initControls() {
  try {
    if (DOM.btnOn) {
      DOM.btnOn.addEventListener('click', () => {
        console.log('🔄 Klik ON');
        set(ref(db, 'system/state'), true)
          .then(() => {
            state.lampState = true;
            scheduleRender();
            showToast('✅ Lampu ON', 'success');
          })
          .catch(err => showToast('❌ Gagal ON: ' + err.message, 'error'));
      });
    }
    
    if (DOM.btnOff) {
      DOM.btnOff.addEventListener('click', () => {
        console.log('🔄 Klik OFF');
        set(ref(db, 'system/state'), false)
          .then(() => {
            state.lampState = false;
            scheduleRender();
            showToast('✅ Lampu OFF', 'success');
          })
          .catch(err => showToast('❌ Gagal OFF: ' + err.message, 'error'));
      });
    }
    
    if (DOM.resetPlantBtn) {
      DOM.resetPlantBtn.addEventListener('click', async () => {
        if (!confirm('🔄 Reset semua data tanam? Aksi ini akan mengatur ulang hari ke-0.')) return;
        try {
          await set(ref(db, 'system/plant_start_date'), null);
          state.plantStartDate = null;
          scheduleRender();
          showToast('✅ Tanaman di-reset!', 'success');
        } catch(e) {
          showToast('❌ Gagal reset: ' + e.message, 'error');
        }
      });
    }
  } catch (e) {
    console.error('❌ Error init controls:', e);
  }
}

// ============================================
// MODE KONTROL
// ============================================
function initModeControls() {
  try {
    console.log('🔄 Init Mode Controls...');
    
    const modeAutoBtn = document.getElementById('modeAutoBtn');
    if (modeAutoBtn) {
      console.log('✅ modeAutoBtn ditemukan');
      modeAutoBtn.addEventListener('click', function() {
        console.log('🔄 Klik Otomatis');
        setModeControl('otomatis');
      });
    } else {
      console.warn('❌ modeAutoBtn TIDAK DITEMUKAN!');
    }
    
    const modeJadwalBtn = document.getElementById('modeJadwalBtn');
    if (modeJadwalBtn) {
      console.log('✅ modeJadwalBtn ditemukan');
      modeJadwalBtn.addEventListener('click', function() {
        console.log('🔄 Klik Jadwal');
        setModeControl('jadwal');
      });
    } else {
      console.warn('❌ modeJadwalBtn TIDAK DITEMUKAN!');
    }
    
    const modeManualBtn = document.getElementById('modeManualBtn');
    if (modeManualBtn) {
      console.log('✅ modeManualBtn ditemukan');
      modeManualBtn.addEventListener('click', function() {
        console.log('🔄 Klik Manual');
        setModeControl('manual');
      });
    } else {
      console.warn('❌ modeManualBtn TIDAK DITEMUKAN!');
    }
    
    const saveLightNeededBtn = document.getElementById('saveLightNeededBtn');
    const totalLightNeeded = document.getElementById('totalLightNeeded');
    
    if (saveLightNeededBtn && totalLightNeeded) {
      console.log('✅ saveLightNeededBtn ditemukan');
      saveLightNeededBtn.addEventListener('click', function() {
        const val = parseInt(totalLightNeeded.value);
        console.log('🔄 Simpan kebutuhan cahaya:', val);
        if (val < 6 || val > 18) { 
          showToast('❌ Kebutuhan cahaya harus 6-18 jam', 'error'); 
          return; 
        }
        set(ref(db, 'system/total_light_needed'), val)
          .then(() => {
            state.totalLightNeeded = val;
            showToast('✅ Kebutuhan cahaya disimpan!', 'success');
          })
          .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
      });
    } else {
      console.warn('❌ saveLightNeededBtn atau totalLightNeeded TIDAK DITEMUKAN!');
    }
    
    const saveThresholdBtn = document.getElementById('saveThresholdBtn');
    const luxThreshold = document.getElementById('luxThreshold');
    
    if (saveThresholdBtn && luxThreshold) {
      console.log('✅ saveThresholdBtn ditemukan');
      saveThresholdBtn.addEventListener('click', function() {
        const val = parseInt(luxThreshold.value);
        console.log('🔄 Simpan threshold:', val);
        if (val < 0 || val > 5000) { 
          showToast('❌ Threshold harus 0-5000 lux', 'error'); 
          return; 
        }
        set(ref(db, 'system/lux_threshold'), val)
          .then(() => {
            state.luxThreshold = val;
            showToast('✅ Threshold lux disimpan!', 'success');
          })
          .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
      });
      
      luxThreshold.addEventListener('input', function(e) {
        const display = document.getElementById('luxThresholdDisplay');
        if (display) display.textContent = e.target.value + ' lux';
      });
    } else {
      console.warn('❌ saveThresholdBtn atau luxThreshold TIDAK DITEMUKAN!');
    }
    
    const saveJadwalBtn = document.getElementById('saveJadwalBtn');
    const jadwalStart = document.getElementById('jadwalStart');
    const jadwalEnd = document.getElementById('jadwalEnd');
    
   