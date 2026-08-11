// ============================================
// MAIN ENTRY – app.js (REVISI DENGAN SMOOTHING)
// ============================================

import { db } from './firebase.js';
import { state, currentUser, setUser, DOM, initDOM, showToast } from './modules/core.js';
import { initCharts, updateCharts, exportData, exportPDF, loadChartHistory, loadDashChartHistory, loadChartHistoryByDate, loadDailyHistory } from './modules/analytics.js';
import { renderUI } from './modules/ui.js';
import { initAdminPanel } from './modules/admin.js';
import { ref, onValue, set, update, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

console.log('🚀 app.js loaded!');

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

// ============================================
// SMOOTHING FILTER (CEGAH FLICKER)
// ============================================
class SmoothingFilter {
    constructor(windowSize = 5) {
        this.windowSize = windowSize;
        this.values = [];
    }
    
    add(value) {
        this.values.push(value);
        if (this.values.length > this.windowSize) {
            this.values.shift();
        }
        const sum = this.values.reduce((a, b) => a + b, 0);
        return sum / this.values.length;
    }
    
    getAverage() {
        if (this.values.length === 0) return 0;
        const sum = this.values.reduce((a, b) => a + b, 0);
        return sum / this.values.length;
    }
}

// Inisialisasi filter
const suhuFilter = new SmoothingFilter(5);  // rata-rata 5 data terakhir
const luxFilter = new SmoothingFilter(5);

// ============================================
// HYSTERESIS STATE (CEGAH FLICKER DI BATAS)
// ============================================
let lastTempCategory = null;
let lastLightCategory = null;

// ============================================
// STATE LISTENER
// ============================================
let unsubSensor = null;
let unsubSystem = null;
let isListenerActive = false;

// ===== THROTTLE =====
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

// ===== GAUGE =====
let gaugeChart = null;

function initGauge() {
  console.log('📊 initGauge dipanggil');
  const ctx = document.getElementById('gaugeChart');
  if (!ctx) return;
  if (gaugeChart) gaugeChart.destroy();

  const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
  gaugeChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [progress, 100 - progress],
        backgroundColor: ['#22c55e', 'rgba(255,255,255,0.1)'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      cutout: '75%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
}

function updateGauge() {
  const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
  const el = document.getElementById('gaugeProgress');
  if (el) el.textContent = progress + '%';
  const sun = document.getElementById('gaugeSunlight');
  if (sun) sun.textContent = (state.accumulatedLight || 0).toFixed(1);
  const grow = document.getElementById('gaugeGrowlight');
  if (grow) {
    const val = Math.max(0, (state.totalLightNeeded || 12) - (state.accumulatedLight || 0));
    grow.textContent = val.toFixed(1);
  }
  if (gaugeChart) {
    gaugeChart.data.datasets[0].data = [progress, 100 - progress];
    gaugeChart.update();
  }
}

// ============================================
// FUNGSI BANTU HYSTERESIS
// ============================================
function getCategoryBoundary(category) {
  if (!category) return 0;
  if (category.includes('Sangat Panas')) return 35;
  if (category.includes('Panas')) return 30;
  if (category.includes('Normal')) return 20;
  return 0;
}

function getLightBoundary(category) {
  if (!category) return 0;
  if (category.includes('Sangat Terang')) return 4000;
  if (category.includes('Terang')) return 2000;
  if (category.includes('Sedang')) return 500;
  if (category.includes('Redup')) return 100;
  return 0;
}

// ============================================
// UPDATE STATUS DENGAN SMOOTHING + HYSTERESIS
// ============================================
function updateStatusTextSmooth(temp, lux) {
  // --- KATEGORI SUHU dengan HYSTERESIS 1.5°C ---
  let newTempCategory = '';
  let newTempColor = '';
  
  if (temp > 35) {
    newTempCategory = '🔥 Sangat Panas';
    newTempColor = '#ef4444';
  } else if (temp > 30) {
    newTempCategory = '🔥 Panas';
    newTempColor = '#f59e0b';
  } else if (temp > 20) {
    newTempCategory = '🌤️ Normal';
    newTempColor = '#22c55e';
  } else {
    newTempCategory = '❄️ Dingin';
    newTempColor = '#3b82f6';
  }
  
  // HYSTERESIS: cegah flicker di batas (28°C dan 35°C)
  if (lastTempCategory) {
    if (lastTempCategory.includes('Panas') && newTempCategory.includes('Normal')) {
      if (temp > 27.5) {
        newTempCategory = lastTempCategory;
        newTempColor = lastTempCategory.includes('Sangat') ? '#ef4444' : '#f59e0b';
      }
    } else if (lastTempCategory.includes('Sangat Panas') && newTempCategory.includes('Panas')) {
      if (temp > 33.5) {
        newTempCategory = lastTempCategory;
        newTempColor = '#ef4444';
      }
    } else if (lastTempCategory.includes('Normal') && newTempCategory.includes('Dingin')) {
      if (temp > 19.5) {
        newTempCategory = lastTempCategory;
        newTempColor = '#22c55e';
      }
    }
  }
  lastTempCategory = newTempCategory;

  // --- KATEGORI CAHAYA dengan HYSTERESIS ---
  let newLightCategory = '';
  let newLightColor = '';
  
  if (lux > 4000) {
    newLightCategory = '☀️ Sangat Terang';
    newLightColor = '#facc15';
  } else if (lux > 2000) {
    newLightCategory = '🌤️ Terang';
    newLightColor = '#f59e0b';
  } else if (lux > 500) {
    newLightCategory = '🌥️ Sedang';
    newLightColor = '#94a3b8';
  } else if (lux > 100) {
    newLightCategory = '🌥️ Redup';
    newLightColor = '#64748b';
  } else {
    newLightCategory = '🌙 Gelap';
    newLightColor = '#3b82f6';
  }
  
  // HYSTERESIS: cegah flicker di batas
  if (lastLightCategory) {
    if (lastLightCategory.includes('Sangat Terang') && newLightCategory.includes('Terang')) {
      if (lux > 3500) {
        newLightCategory = lastLightCategory;
        newLightColor = '#facc15';
      }
    } else if (lastLightCategory.includes('Terang') && newLightCategory.includes('Sedang')) {
      if (lux > 1500) {
        newLightCategory = lastLightCategory;
        newLightColor = '#f59e0b';
      }
    } else if (lastLightCategory.includes('Sedang') && newLightCategory.includes('Redup')) {
      if (lux > 300) {
        newLightCategory = lastLightCategory;
        newLightColor = '#94a3b8';
      }
    } else if (lastLightCategory.includes('Redup') && newLightCategory.includes('Gelap')) {
      if (lux > 80) {
        newLightCategory = lastLightCategory;
        newLightColor = '#64748b';
      }
    }
  }
  lastLightCategory = newLightCategory;

  // --- UPDATE UI SUHU ---
  const tempEl = document.getElementById('tempStatus');
  if (tempEl) {
    tempEl.textContent = newTempCategory;
    tempEl.style.color = newTempColor;
  }
  
  const statTempStatus = document.getElementById('statTempStatus');
  if (statTempStatus) {
    statTempStatus.textContent = newTempCategory.replace(/[🔥🌤️❄️]/g, '').trim() || 'Normal';
    statTempStatus.style.color = newTempColor;
  }

  // --- UPDATE UI CAHAYA ---
  const lightEl = document.getElementById('lightStatus');
  if (lightEl) {
    lightEl.textContent = newLightCategory;
    lightEl.style.color = newLightColor;
  }
  
  const statLightStatus = document.getElementById('statLightStatus');
  if (statLightStatus) {
    statLightStatus.textContent = newLightCategory.replace(/[☀️🌤️🌥️🌙]/g, '').trim() || 'Sedang';
    statLightStatus.style.color = newLightColor;
  }

  // --- STATUS LAMPU ---
  const lampEl = document.getElementById('lampStatusText');
  if (lampEl) {
    lampEl.textContent = state.lampState ? '💡 Lampu Aktif' : '⛔ Lampu Mati';
    lampEl.style.color = state.lampState ? '#22c55e' : '#ef4444';
  }
}

// ===== CEK KONEKSI =====
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
      const now = new Date();
      const [h, m, s] = lastUpdate.innerText.split(':').map(Number);
      const lastDate = new Date();
      lastDate.setHours(h, m, s || 0);
      esp32Online = (now - lastDate) / 60000 < 15;
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
      position: fixed; top: 10px; right: 10px; padding: 8px 16px; border-radius: 10px;
      font-size: 13px; font-weight: 600; z-index: 9999; transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3); pointer-events: none; display: none;
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
  console.log('📄 DOMContentLoaded fired!');
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

    // FILTER TANGGAL
    const analyticsDate = document.getElementById('analyticsDate');
    const loadBtn = document.getElementById('loadHistoryDateBtn');
    const resetBtn = document.getElementById('resetHistoryDateBtn');
    if (analyticsDate) {
      analyticsDate.value = new Date().toISOString().slice(0, 10);
    }
    if (loadBtn) {
      loadBtn.addEventListener('click', function() {
        const date = document.getElementById('analyticsDate').value;
        console.log('📅 Klik Tampilkan, tanggal:', date);
        if (date) loadChartHistoryByDate(date);
        else showToast('⚠️ Pilih tanggal dulu!', 'warning');
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        const today = new Date().toISOString().slice(0, 10);
        document.getElementById('analyticsDate').value = today;
        loadChartHistory();
        showToast('✅ Kembali ke data hari ini', 'info');
      });
    }

    loadChartHistory();
    loadDashChartHistory();
    loadDailyHistory();

    setTimeout(() => initGauge(), 500);

    updateClock();
    setInterval(updateClock, 1000);

    if (DOM.userName) {
      DOM.userName.textContent = `👋 ${currentUser?.nama || 'User'}`;
    }

    setupNavigation();
    cekKoneksi();
    setInterval(cekKoneksi, 30000);

    console.log("🚀 App siap!");
  } catch (e) {
    console.error('❌ Error saat start app:', e);
  }
});

// ============================================
// FIREBASE LISTENERS (REVISI DENGAN SMOOTHING)
// ============================================
function initFirebase() {
  try {
    if (isListenerActive) {
      console.log('⚠️ Listener sudah aktif, skip.');
      return;
    }
    isListenerActive = true;
    console.log('🔌 Memasang Firebase listeners...');

    // --- Sensor (REVISI: PAKAI SMOOTHING) ---
    unsubSensor = onValue(ref(db, 'sensor'), (snap) => {
      try {
        const now = Date.now();
        if (now - lastSensorUpdate < SENSOR_THROTTLE) return;
        lastSensorUpdate = now;

        const d = snap.val();
        if (d) {
          const rawSuhu = d.suhu || 0;
          const rawLux = d.cahaya || 0;
          
          // SMOOTHING: filter data sebelum dipakai
          const validSuhu = (rawSuhu > 0 && rawSuhu < 60) ? rawSuhu : 25;
          const validLux = (rawLux >= 0 && rawLux < 10000) ? rawLux : 0;
          
          const smoothSuhu = suhuFilter.add(validSuhu);
          const smoothLux = luxFilter.add(validLux);
          
          // Simpan nilai yang sudah di-smooth ke state
          state.temperature = smoothSuhu;
          state.sensorLight = smoothLux;

          // Update UI
          if (DOM.statLight) DOM.statLight.textContent = Math.round(smoothLux);
          if (DOM.statTemp) DOM.statTemp.textContent = smoothSuhu.toFixed(1);
          if (DOM.monitorTemp) DOM.monitorTemp.textContent = smoothSuhu.toFixed(1);
          if (DOM.monitorLight) DOM.monitorLight.textContent = Math.round(smoothLux);

          if (DOM.dashLastUpdate) {
            const time = new Date().toLocaleTimeString('id-ID');
            DOM.dashLastUpdate.textContent = time;
          }

          // Update status pakai smooth + hysteresis
          updateStatusTextSmooth(smoothSuhu, smoothLux);
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
          state.lampState = d.actual_state || false;
          state.forceDayOn = d.force_day_on || false;
          state.jadwalStart = d.jadwal_start || 6;
          state.jadwalEnd = d.jadwal_end || 18;
          state.totalLightNeeded = d.total_light_needed || 12;
          state.accumulatedLight = d.accumulated_light || 0;
          state.lastResetDate = d.last_reset_date || '';
          state.alert = d.alert || '';

          const today = new Date().toISOString().slice(0, 10);
          if (state.lastResetDate !== today) {
            state.accumulatedLight = 0;
            state.lastResetDate = today;
          }

          // Update mode display
          const display = document.getElementById('currentModeDisplay');
          const displayControl = document.getElementById('currentModeDisplayControl');
          const labels = { otomatis: '🤖 Otomatis', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
          if (display) display.textContent = labels[state.controlMode] || state.controlMode;
          if (displayControl) displayControl.textContent = labels[state.controlMode] || state.controlMode;

          const statusText = state.lampState ? 'ON' : 'OFF';
          const statusColor = state.lampState ? '#22c55e' : '#ef4444';
          ['dashLampStatus', 'lampStateText', 'statLamp', 'monitorLampStatus'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
              el.textContent = statusText;
              el.style.color = statusColor;
            }
          });

          if (DOM.forceDayOn) DOM.forceDayOn.checked = state.forceDayOn;
          if (DOM.jadwalStart) DOM.jadwalStart.value = state.jadwalStart;
          if (DOM.jadwalEnd) DOM.jadwalEnd.value = state.jadwalEnd;
          if (DOM.totalLightNeeded) DOM.totalLightNeeded.value = state.totalLightNeeded;

          const latestTemp = document.getElementById('dashLatestTemp');
          if (latestTemp) latestTemp.textContent = state.temperature.toFixed(1) + '°C';

          const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
          const display2 = progress > 100 ? 100 : progress;
          if (DOM.statLightProgress) DOM.statLightProgress.textContent = display2;
          if (DOM.lightProgressDisplay) DOM.lightProgressDisplay.textContent = display2 + '%';
          if (DOM.sunlightHours) DOM.sunlightHours.textContent = (state.accumulatedLight || 0).toFixed(1);

          updateGauge();
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

// ============================================
// UPDATE STATUS TEXT (FALLBACK - HANYA UNTUK LAMPU)
// ============================================
function updateStatusText() {
  // Fungsi ini digantikan oleh updateStatusTextSmooth()
  // Hanya untuk update status lampu dari listener system
  const lampEl = document.getElementById('lampStatusText');
  if (lampEl) {
    lampEl.textContent = state.lampState ? '💡 Lampu Aktif' : '⛔ Lampu Mati';
    lampEl.style.color = state.lampState ? '#22c55e' : '#ef4444';
  }
}

// ============================================
// UNSUBSCRIBE
// ============================================
function unsubscribeAll() {
  try {
    if (unsubSensor) { unsubSensor();
      unsubSensor = null; }
    if (unsubSystem) { unsubSystem();
      unsubSystem = null; }
    isListenerActive = false;
    console.log('⏸️ Listener dihentikan');
  } catch (e) {
    console.error('❌ Error unsubscribe:', e);
  }
}

// ============================================
// NAVIGASI
// ============================================
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
            if (!isListenerActive) initFirebase();
          } else {
            if (isListenerActive) unsubscribeAll();
          }
          if (window.innerWidth <= 768) closeMenu();
        } catch (e) { console.error('❌ Error klik menu:', e); }
      });
    });
  } catch (e) { console.error('❌ Error setup navigasi:', e); }
}

// ============================================
// UPDATE UI TOMBOL MODE
// ============================================
function updateModeButtonUI(mode) {
  try {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.remove('active-mode');
      btn.style.background = 'rgba(255,255,255,0.05)';
      btn.style.border = '1px solid rgba(255,255,255,0.1)';
      btn.style.color = 'white';
    });
    const map = { otomatis: 'modeAutoBtn', jadwal: 'modeJadwalBtn', manual: 'modeManualBtn' };
    const activeId = map[mode];
    if (activeId) {
      const btn = document.getElementById(activeId);
      if (btn) {
        btn.classList.add('active-mode');
        btn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
        btn.style.border = '1px solid #22c55e';
        btn.style.color = 'white';
      }
    }
  } catch (e) { console.error('❌ Error update mode button:', e); }
}

// ============================================
// FUNGSI SET LAMPU STATE
// ============================================
function setLampState(newState) {
  console.log('🔄 setLampState:', newState);
  set(ref(db, 'system/state'), newState)
    .then(() => {
      showToast(`✅ Perintah ${newState ? 'ON' : 'OFF'} dikirim`, 'success');
    })
    .catch(err => {
      console.error('❌ Gagal:', err);
      showToast('❌ Gagal: ' + err.message, 'error');
    });
}

// ============================================
// FUNGSI SET MODE
// ============================================
function setModeControl(mode) {
  console.log('🔄 setModeControl:', mode);
  set(ref(db, 'system/mode'), mode)
    .then(() => {
      state.controlMode = mode;
      const display = document.getElementById('currentModeDisplay');
      const displayControl = document.getElementById('currentModeDisplayControl');
      const labels = { otomatis: '🤖 Otomatis', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
      if (display) display.textContent = labels[mode] || mode;
      if (displayControl) displayControl.textContent = labels[mode] || mode;
      updateModeButtonUI(mode);
      showToast(`✅ Mode ${mode} aktif`, 'success');
    })
    .catch(err => {
      console.error('❌ Gagal:', err);
      showToast('❌ Gagal: ' + err.message, 'error');
    });
}

// ============================================
// CONTROLS
// ============================================
function initControls() {
  try {
    if (DOM.btnOn) {
      DOM.btnOn.addEventListener('click', () => {
        setLampState(true);
      });
    }
    if (DOM.btnOff) {
      DOM.btnOff.addEventListener('click', () => {
        setLampState(false);
      });
    }
    if (DOM.resetPlantBtn) {
      DOM.resetPlantBtn.addEventListener('click', async () => {
        if (!confirm('🔄 Reset semua data tanam?')) return;
        try {
          await set(ref(db, 'system/plant_start_date'), null);
          state.plantStartDate = null;
          scheduleRender();
          showToast('✅ Tanaman di-reset!', 'success');
        } catch (e) { showToast('❌ Gagal reset: ' + e.message, 'error'); }
      });
    }
  } catch (e) { console.error('❌ Error init controls:', e); }
}

// ============================================
// MODE KONTROL (REVISI: HAPUS LUX THRESHOLD)
// ============================================
function initModeControls() {
  try {
    console.log('🔄 Init Mode Controls...');
    const modeAutoBtn = document.getElementById('modeAutoBtn');
    if (modeAutoBtn) {
      modeAutoBtn.addEventListener('click', () => {
        setModeControl('otomatis');
      });
    }
    const modeJadwalBtn = document.getElementById('modeJadwalBtn');
    if (modeJadwalBtn) {
      modeJadwalBtn.addEventListener('click', () => {
        setModeControl('jadwal');
      });
    }
    const modeManualBtn = document.getElementById('modeManualBtn');
    if (modeManualBtn) {
      modeManualBtn.addEventListener('click', () => {
        setModeControl('manual');
      });
    }

    // Kebutuhan Cahaya Harian
    const saveLightNeededBtn = document.getElementById('saveLightNeededBtn');
    const totalLightNeeded = document.getElementById('totalLightNeeded');
    if (saveLightNeededBtn && totalLightNeeded) {
      saveLightNeededBtn.addEventListener('click', function() {
        const val = parseInt(totalLightNeeded.value);
        if (val < 6 || val > 18) { showToast('❌ Kebutuhan cahaya harus 6-18 jam', 'error'); return; }
        set(ref(db, 'system/total_light_needed'), val)
          .then(() => { state.totalLightNeeded = val;
            showToast('✅ Kebutuhan cahaya disimpan!', 'success'); })
          .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
      });
    }

    // Save Jadwal
    const saveJadwalBtn = document.getElementById('saveJadwalBtn');
    const jadwalStart = document.getElementById('jadwalStart');
    const jadwalEnd = document.getElementById('jadwalEnd');
    if (saveJadwalBtn && jadwalStart && jadwalEnd) {
      saveJadwalBtn.addEventListener('click', function() {
        const start = parseInt(jadwalStart.value);
        const end = parseInt(jadwalEnd.value);
        if (isNaN(start) || isNaN(end) || start < 0 || start > 23 || end < 0 || end > 23) {
          showToast('❌ Jam harus 0-23', 'error');
          return;
        }
        set(ref(db, 'system/jadwal_start'), start);
        set(ref(db, 'system/jadwal_end'), end)
          .then(() => showToast(`✅ Jadwal ${start}:00 - ${end}:00 disimpan!`, 'success'))
          .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
      });
    }

    // Force Day On
    const forceDayOn = document.getElementById('forceDayOn');
    if (forceDayOn) {
      forceDayOn.addEventListener('change', function() {
        const val = this.checked;
        set(ref(db, 'system/force_day_on'), val)
          .then(() => { state.forceDayOn = val;
            showToast(val ? '☀️ Force Day ON aktif' : '🌙 Force Day OFF', 'info'); })
          .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
      });
    }
    console.log('✅ Init Mode Controls Selesai');
  } catch (e) { console.error('❌ Error init mode controls:', e); }
}

// ============================================
// EXPAND CHART
// ============================================
function initExpandChart() {
  window.toggleExpand = function(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    const isExpanded = wrapper.classList.contains('expanded');
    document.querySelectorAll('.chart-wrapper.expanded').forEach(el => {
      if (el.id !== wrapperId) el.classList.remove('expanded');
    });
    if (isExpanded) {
      wrapper.classList.remove('expanded');
    } else {
      wrapper.classList.add('expanded');
      setTimeout(() => wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
    const canvas = wrapper.querySelector('canvas');
    if (canvas) {
      const chart = Chart.getChart(canvas);
      if (chart) chart.resize();
    }
  };
}

// ============================================
// CLOCK
// ============================================
function updateClock() {
  try {
    const now = new Date();
    const dateEl = document.getElementById('dateText');
    const clockEl = document.getElementById('clockText');
    if (dateEl) {
      dateEl.innerText = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    if (clockEl) {
      clockEl.innerText = now.toLocaleTimeString('id-ID');
    }
  } catch (e) { console.error('❌ Error update clock:', e); }
}

// ============================================
// SIDEBAR
// ============================================
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.querySelector('.sidebar');
const overlay = document.querySelector('.mobile-overlay') || (() => {
  const el = document.createElement('div');
  el.className = 'mobile-overlay';
  document.body.appendChild(el);
  return el;
})();

function closeMenu() {
  try {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  } catch (e) { console.error('❌ Error close menu:', e); }
}

if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
    document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
  });
  menuToggle.addEventListener('touchstart', (e) => {
    e.preventDefault();
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
  }, { passive: false });
}

if (overlay) {
  overlay.addEventListener('click', closeMenu);
  overlay.addEventListener('touchstart', (e) => { e.preventDefault();
    closeMenu(); }, { passive: false });
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 768) closeMenu();
});

// ============================================
// DEFAULT SECTION
// ============================================
const defaultSection = document.getElementById('dashboard');
if (defaultSection) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  defaultSection.classList.remove('hidden');
}
