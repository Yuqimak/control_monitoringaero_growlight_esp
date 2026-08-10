// ============================================
// MAIN ENTRY – app.js (FINAL - FULL INTEGRATION)
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

// ===== STATE LISTENER =====
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
          state.sensorLight = d.cahaya || 0;

          if (state.temperature !== oldTemp || state.sensorLight !== oldLight) {
            updateCharts(new Date().toLocaleTimeString());
          }

          const luxThreshold = state.luxThreshold || 500;
          if (d.cahaya > luxThreshold) {
            state.accumulatedLight = (state.accumulatedLight || 0) + (1 / 3600);
          }

          const totalNeeded = state.totalLightNeeded || 12;
          const progress = Math.min(100, Math.round((state.accumulatedLight / totalNeeded) * 100));

          if (DOM.statLight) DOM.statLight.textContent = state.sensorLight;
          if (DOM.statTemp) DOM.statTemp.textContent = state.temperature.toFixed(1);
          if (DOM.monitorTemp) DOM.monitorTemp.textContent = state.temperature.toFixed(1);
          if (DOM.monitorLight) DOM.monitorLight.textContent = state.sensorLight;

          if (DOM.statLightProgress) DOM.statLightProgress.textContent = progress;
          if (DOM.lightProgressDisplay) DOM.lightProgressDisplay.textContent = progress + '%';
          if (DOM.sunlightHours) DOM.sunlightHours.textContent = (state.accumulatedLight || 0).toFixed(1);
          if (DOM.growlightHours) {
            const grow = Math.max(0, totalNeeded - (state.accumulatedLight || 0));
            DOM.growlightHours.textContent = grow.toFixed(1);
          }

          if (DOM.dashLastUpdate) {
            const time = new Date().toLocaleTimeString('id-ID');
            DOM.dashLastUpdate.textContent = time;
          }

          updateGauge();
          updateStatusText();
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

          const today = new Date().toISOString().slice(0, 10);
          if (state.lastResetDate !== today) {
            state.accumulatedLight = 0;
            state.lastResetDate = today;
          }

          if (DOM.currentModeDisplay2) {
            const labels = { otomatis: '🤖 Otomatis (Lux)', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
            DOM.currentModeDisplay2.textContent = labels[state.controlMode] || state.controlMode;
          }

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
          if (DOM.luxThresholdDisplay) DOM.luxThresholdDisplay.textContent = state.luxThreshold + ' lux';
          if (DOM.luxThreshold) DOM.luxThreshold.value = state.luxThreshold;
          if (DOM.jadwalStart) DOM.jadwalStart.value = state.jadwalStart;
          if (DOM.jadwalEnd) DOM.jadwalEnd.value = state.jadwalEnd;
          if (DOM.totalLightNeeded) DOM.totalLightNeeded.value = state.totalLightNeeded;

          const latestTemp = document.getElementById('dashLatestTemp');
          if (latestTemp) latestTemp.textContent = state.temperature.toFixed(1) + '°C';

          if (DOM.sunlightHours) DOM.sunlightHours.textContent = (state.accumulatedLight || 0).toFixed(1);
          if (DOM.growlightHours) {
            const grow = Math.max(0, (state.totalLightNeeded || 12) - (state.accumulatedLight || 0));
            DOM.growlightHours.textContent = grow.toFixed(1);
          }
          if (DOM.lightProgressDisplay || DOM.statLightProgress) {
            const progress = Math.min(100, Math.round(((state.accumulatedLight || 0) / (state.totalLightNeeded || 12)) * 100));
            const display = progress > 100 ? 100 : progress;
            if (DOM.lightProgressDisplay) DOM.lightProgressDisplay.textContent = display + '%';
            if (DOM.statLightProgress) DOM.statLightProgress.textContent = display;
          }

          updateGauge();
          updateModeButtonUI(state.controlMode);
          updateStatusText();
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
// UPDATE STATUS TEXT
// ============================================
function updateStatusText() {
  const temp = state.temperature;
  const lux = state.sensorLight;

  const tempEl = document.getElementById('tempStatus');
  if (tempEl) {
    if (temp > 35) {
      tempEl.textContent = '🔥 Sangat Panas';
      tempEl.style.color = '#ef4444';
    } else if (temp > 30) {
      tempEl.textContent = '🔥 Panas';
      tempEl.style.color = '#f59e0b';
    } else if (temp > 20) {
      tempEl.textContent = '🌤️ Normal';
      tempEl.style.color = '#22c55e';
    } else {
      tempEl.textContent = '❄️ Dingin';
      tempEl.style.color = '#3b82f6';
    }
  }

  const lightEl = document.getElementById('lightStatus');
  if (lightEl) {
    if (lux > 4000) {
      lightEl.textContent = '☀️ Sangat Terang';
      lightEl.style.color = '#facc15';
    } else if (lux > 2000) {
      lightEl.textContent = '🌤️ Terang';
      lightEl.style.color = '#f59e0b';
    } else if (lux > 500) {
      lightEl.textContent = '🌥️ Sedang';
      lightEl.style.color = '#94a3b8';
    } else if (lux > 100) {
      lightEl.textContent = '🌥️ Redup';
      lightEl.style.color = '#64748b';
    } else {
      lightEl.textContent = '🌙 Gelap';
      lightEl.style.color = '#3b82f6';
    }
  }

  const lampEl = document.getElementById('lampStatusText');
  if (lampEl) {
    lampEl.textContent = state.lampState ? '💡 Lampu Aktif' : '⛔ Lampu Mati';
    lampEl.style.color = state.lampState ? '#22c55e' : '#ef4444';
  }

  const statTempStatus = document.getElementById('statTempStatus');
  if (statTempStatus) {
    if (temp > 35) {
      statTempStatus.textContent = 'Sangat Panas';
      statTempStatus.style.color = '#ef4444';
    } else if (temp > 30) {
      statTempStatus.textContent = 'Panas';
      statTempStatus.style.color = '#f59e0b';
    } else if (temp > 20) {
      statTempStatus.textContent = 'Normal';
      statTempStatus.style.color = '#22c55e';
    } else {
      statTempStatus.textContent = 'Dingin';
      statTempStatus.style.color = '#3b82f6';
    }
  }

  const statLightStatus = document.getElementById('statLightStatus');
  if (statLightStatus) {
    if (lux > 4000) {
      statLightStatus.textContent = 'Sangat Terang';
      statLightStatus.style.color = '#facc15';
    } else if (lux > 2000) {
      statLightStatus.textContent = 'Terang';
      statLightStatus.style.color = '#f59e0b';
    } else if (lux > 500) {
      statLightStatus.textContent = 'Sedang';
      statLightStatus.style.color = '#94a3b8';
    } else if (lux > 100) {
      statLightStatus.textContent = 'Redup';
      statLightStatus.style.color = '#64748b';
    } else {
      statLightStatus.textContent = 'Gelap';
      statLightStatus.style.color = '#3b82f6';
    }
  }
}

// ===== UNSUBSCRIBE =====
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

// ===== UPDATE UI TOMBOL MODE =====
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
// CONTROLS
// ============================================
function initControls() {
  try {
    if (DOM.btnOn) {
      DOM.btnOn.addEventListener('click', () => {
        set(ref(db, 'system/state'), true)
          .then(() => { state.lampState = true;
            scheduleRender();
            showToast('✅ Lampu ON', 'success'); })
          .catch(err => showToast('❌ Gagal ON: ' + err.message, 'error'));
      });
    }
    if (DOM.btnOff) {
      DOM.btnOff.addEventListener('click', () => {
        set(ref(db, 'system/state'), false)
          .then(() => { state.lampState = false;
            scheduleRender();
            showToast('✅ Lampu OFF', 'success'); })
          .catch(err => showToast('❌ Gagal OFF: ' + err.message, 'error'));
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
// MODE KONTROL
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

    const saveThresholdBtn = document.getElementById('saveThresholdBtn');
    const luxThreshold = document.getElementById('luxThreshold');
    if (saveThresholdBtn && luxThreshold) {
      saveThresholdBtn.addEventListener('click', function() {
        const val = parseInt(luxThreshold.value);
        if (val < 0 || val > 5000) { showToast('❌ Threshold harus 0-5000 lux', 'error'); return; }
        set(ref(db, 'system/lux_threshold'), val)
          .then(() => { state.luxThreshold = val;
            showToast('✅ Threshold lux disimpan!', 'success'); })
          .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
      });
      luxThreshold.addEventListener('input', function(e) {
        const display = document.getElementById('luxThresholdDisplay');
        if (display) display.textContent = e.target.value + ' lux';
      });
    }

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

function setModeControl(mode) {
  set(ref(db, 'system/mode'), mode)
    .then(() => {
      state.controlMode = mode;
      const display = document.getElementById('currentModeDisplay2');
      if (display) {
        const labels = { otomatis: '🤖 Otomatis (Lux)', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
        display.textContent = labels[mode] || mode;
      }
      updateModeButtonUI(mode);
      showToast(`✅ Mode ${mode} aktif`, 'success');
    })
    .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
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
