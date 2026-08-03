// ============================================
// MAIN ENTRY – app.js (FULLY FIXED + FITUR CAHAYA)
// ============================================

import { db } from './firebase.js';
import { state, currentUser, setUser, DOM, initDOM, showToast } from './modules/core.js';
import { initCharts, updateCharts, exportData, exportPDF, loadChartHistory } from './modules/analytics.js';
import { renderUI, getDays, getReminder, getModeConfig, updateModeUI } from './modules/ui.js';
import { initAdminPanel } from './modules/admin.js';
import { ref, onValue, set, update, push, query, orderByKey, limitToLast, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

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
let unsubControl = null;
let unsubSystem = null;
let isListenerActive = false;

// ===== THROTTLE VARIABEL =====
let lastSensorUpdate = 0;
const SENSOR_THROTTLE = 1000;

// ===== RENDER DEBOUNCE =====
let renderTimeout = null;
function scheduleRender() {
  if (renderTimeout) clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => {
    renderUI();
    renderTimeout = null;
  }, 200);
}

// ===== APP START =====
document.addEventListener("DOMContentLoaded", () => {
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
  
  updateClock();
  setInterval(updateClock, 1000);
  
  if (DOM.userName) {
    DOM.userName.textContent = `👋 ${currentUser?.nama || 'User'}`;
  }
  
  setupNavigation();
  
  console.log("🚀 App siap!");
});

// ============================================
// FIREBASE LISTENERS
// ============================================
function initFirebase() {
  if (isListenerActive) {
    console.log('⚠️ Listener sudah aktif, skip.');
    return;
  }
  isListenerActive = true;
  console.log('🔌 Memasang Firebase listeners...');

  // --- Sensor ---
  unsubSensor = onValue(ref(db, 'sensor'), (snap) => {
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
      
      // 🔥 HITUNG AKUMULASI CAHAYA
      const luxThreshold = state.luxThreshold || 500;
      const rawLight = d.cahaya || 0;
      
      if (rawLight > luxThreshold) {
        const increment = 1 / 3600;
        state.accumulatedLight = (state.accumulatedLight || 0) + increment;
        
        // Update Firebase tiap 60 detik
        if (Math.floor(Date.now() / 60000) % 2 === 0) {
          set(ref(db, 'system/accumulated_light'), state.accumulatedLight);
        }
      }
      
      // Update UI Progress
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
  }, (err) => {
    console.error("❌ Sensor error:", err);
    if (DOM.connStatus) {
      DOM.connStatus.innerText = "Disconnected";
      DOM.connStatus.style.color = "#ef4444";
    }
    isListenerActive = false;
  });

  // --- Control ---
  let lastControlUpdate = 0;
  unsubControl = onValue(ref(db, 'control'), (snap) => {
    const now = Date.now();
    if (now - lastControlUpdate < 2000) return;
    lastControlUpdate = now;

    const d = snap.val();
    if (d?.lamp) {
      state.lampState = d.lamp.state || false;
      state.mode = d.lamp.mode || 'manual';
    }
    scheduleRender();
  }, (err) => {
    console.error("❌ Control error:", err);
    isListenerActive = false;
  });

  // --- System ---
  let lastSystemUpdate = 0;
  unsubSystem = onValue(ref(db, 'system'), (snap) => {
    const now = Date.now();
    if (now - lastSystemUpdate < 2000) return;
    lastSystemUpdate = now;

    const d = snap.val();
    if (d) {
      state.plantStartDate = d.plant_start_date || null;
      state.alert = d.alert || '';
      state.controlMode = d.control_mode || d.lamp_mode || 'otomatis';
      state.totalJam = d.total_jam || 14;
      state.cycleOn = d.cycle_on || 15;
      state.cycleOff = d.cycle_off || 15;
      state.luxThreshold = d.lux_threshold || 500;
      state.forceDayOn = d.force_day_on || false;
      state.jadwalStart = d.jadwal_start || 6;
      state.jadwalEnd = d.jadwal_end || 18;
      
      // 🔥 FITUR BARU: Kebutuhan Cahaya
      state.totalLightNeeded = d.total_light_needed || 12;
      state.accumulatedLight = d.accumulated_light || 0;
      state.lastResetDate = d.last_reset_date || '';
      
      // Reset akumulasi setiap hari
      const today = new Date().toISOString().slice(0,10);
      if (state.lastResetDate !== today) {
        state.accumulatedLight = 0;
        state.lastResetDate = today;
        set(ref(db, 'system/accumulated_light'), 0);
        set(ref(db, 'system/last_reset_date'), today);
      }
      
      if (DOM.currentModeDisplay2) {
        const labels = { otomatis: '🤖 Otomatis (Lux)', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
        DOM.currentModeDisplay2.textContent = labels[state.controlMode] || state.controlMode;
      }
      if (DOM.forceDayOn) DOM.forceDayOn.checked = state.forceDayOn;
      if (DOM.luxThresholdDisplay) DOM.luxThresholdDisplay.textContent = state.luxThreshold + ' lux';
      if (DOM.luxThreshold) DOM.luxThreshold.value = state.luxThreshold;
      if (DOM.totalJam) DOM.totalJam.value = state.totalJam;
      if (DOM.jadwalStart) DOM.jadwalStart.value = state.jadwalStart;
      if (DOM.jadwalEnd) DOM.jadwalEnd.value = state.jadwalEnd;
      
      // 🔥 Update UI kebutuhan cahaya
      if (DOM.totalLightNeeded) DOM.totalLightNeeded.value = state.totalLightNeeded;
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
  }, (err) => {
    console.error("❌ System error:", err);
    isListenerActive = false;
  });
}

// ===== UNSUBSCRIBE =====
function unsubscribeAll() {
  if (unsubSensor) { unsubSensor(); unsubSensor = null; }
  if (unsubControl) { unsubControl(); unsubControl = null; }
  if (unsubSystem) { unsubSystem(); unsubSystem = null; }
  isListenerActive = false;
  console.log('⏸️ Listener dihentikan');
}

// ===== NAVIGASI =====
function setupNavigation() {
  const sectionsNeedingLive = ['dashboard', 'monitoring'];
  
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', function(e) {
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
    });
  });
}

// ===== UPDATE UI TOMBOL MODE =====
function updateModeButtonUI(mode) {
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
}

// ===== CONTROLS =====
function initControls() {
  if (DOM.btnOn) {
    DOM.btnOn.addEventListener('click', () => {
      set(ref(db, 'control/lamp/state'), true)
        .then(() => { state.lampState = true; scheduleRender(); })
        .catch(err => showToast('❌ Gagal ON: ' + err.message, 'error'));
    });
  }
  if (DOM.btnOff) {
    DOM.btnOff.addEventListener('click', () => {
      set(ref(db, 'control/lamp/state'), false)
        .then(() => { state.lampState = false; scheduleRender(); })
        .catch(err => showToast('❌ Gagal OFF: ' + err.message, 'error'));
    });
  }
  
  if (DOM.applyModeBtn && DOM.growthMode) {
    DOM.applyModeBtn.addEventListener('click', async () => {
      const mode = DOM.growthMode.value;
      const config = getModeConfig(mode);
      
      if (mode === 'manual') {
        await update(ref(db, 'control/lamp'), { mode: 'manual' });
        state.mode = 'manual';
        scheduleRender();
        showToast('🎛 Mode Manual aktif', 'info');
        return;
      }
      
      await update(ref(db, 'control/lamp'), { mode, state: true });
      if (!state.plantStartDate) {
        await set(ref(db, 'system/plant_start_date'), new Date().toISOString());
        state.plantStartDate = new Date().toISOString();
      }
      state.mode = mode;
      state.lampState = true;
      scheduleRender();
      showToast(`✅ Mode ${config.icon} ${config.label} diterapkan! (${config.duration} jam)`, 'success');
    });
  }
  
  if (DOM.resetPlantBtn) {
    DOM.resetPlantBtn.addEventListener('click', async () => {
      if (!confirm('🔄 Reset semua data tanam? Aksi ini akan mengatur ulang hari ke-0.')) return;
      await set(ref(db, 'system/plant_start_date'), null);
      await set(ref(db, 'control/lamp/mode'), 'manual');
      state.plantStartDate = null;
      state.mode = 'manual';
      scheduleRender();
      showToast('✅ Tanaman di-reset!', 'success');
    });
  }
}

// ============================================
// MODE KONTROL & KEBUTUHAN CAHAYA
// ============================================
function initModeControls() {
  if (DOM.modeAutoBtn) {
    DOM.modeAutoBtn.addEventListener('click', () => setModeControl('otomatis'));
  }
  if (DOM.modeJadwalBtn) {
    DOM.modeJadwalBtn.addEventListener('click', () => setModeControl('jadwal'));
  }
  if (DOM.modeManualBtn) {
    DOM.modeManualBtn.addEventListener('click', () => setModeControl('manual'));
  }
  
  // 🔥 FITUR BARU: Simpan Kebutuhan Cahaya
  if (DOM.saveLightNeededBtn && DOM.totalLightNeeded) {
    DOM.saveLightNeededBtn.addEventListener('click', () => {
      const val = parseInt(DOM.totalLightNeeded.value);
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
  }
  
  if (DOM.saveTotalJamBtn && DOM.totalJam) {
    DOM.saveTotalJamBtn.addEventListener('click', () => {
      const val = parseInt(DOM.totalJam.value);
      if (val < 1 || val > 18) { showToast('❌ Total jam harus 1-18 jam', 'error'); return; }
      set(ref(db, 'system/total_jam'), val)
        .then(() => showToast('✅ Total jam disimpan!', 'success'))
        .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
    });
  }
  
  if (DOM.saveThresholdBtn && DOM.luxThreshold) {
    DOM.saveThresholdBtn.addEventListener('click', () => {
      const val = parseInt(DOM.luxThreshold.value);
      if (val < 0 || val > 5000) { showToast('❌ Threshold harus 0-5000 lux', 'error'); return; }
      set(ref(db, 'system/lux_threshold'), val)
        .then(() => showToast('✅ Threshold lux disimpan!', 'success'))
        .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
    });
    DOM.luxThreshold.addEventListener('input', (e) => {
      if (DOM.luxThresholdDisplay) DOM.luxThresholdDisplay.textContent = e.target.value + ' lux';
    });
  }
  
  if (DOM.forceDayOn) {
    DOM.forceDayOn.addEventListener('change', () => {
      set(ref(db, 'system/force_day_on'), DOM.forceDayOn.checked)
        .then(() => showToast(DOM.forceDayOn.checked ? '☀️ Force Day ON aktif' : '🌙 Force Day OFF', 'info'))
        .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
    });
  }
  
  if (DOM.saveJadwalBtn && DOM.jadwalStart && DOM.jadwalEnd) {
    DOM.saveJadwalBtn.addEventListener('click', () => {
      const start = parseInt(DOM.jadwalStart.value);
      const end = parseInt(DOM.jadwalEnd.value);
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
}

function setModeControl(mode) {
  set(ref(db, 'system/control_mode'), mode)
    .then(() => {
      state.controlMode = mode;
      if (DOM.currentModeDisplay2) {
        const labels = { otomatis: '🤖 Otomatis (Lux)', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
        DOM.currentModeDisplay2.textContent = labels[mode] || mode;
      }
      updateModeButtonUI(mode);
      showToast(`✅ Mode ${mode} aktif`, 'success');
    })
    .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
}

// ===== EXPAND CHART =====
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
      setTimeout(() => wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
    
    const canvas = wrapper.querySelector('canvas');
    if (canvas) {
      const chart = Chart.getChart(canvas);
      if (chart) chart.resize();
    }
  };
}

// ===== CLOCK =====
function updateClock() {
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
}

// ===== SIDEBAR =====
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.querySelector('.sidebar');
const overlay = document.querySelector('.mobile-overlay') || (() => {
  const el = document.createElement('div');
  el.className = 'mobile-overlay';
  document.body.appendChild(el);
  return el;
})();

function closeMenu() {
  sidebar.classList.remove('active');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
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
  overlay.addEventListener('touchstart', (e) => { e.preventDefault(); closeMenu(); }, { passive: false });
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 768) closeMenu();
});

// ===== DEFAULT SECTION =====
const defaultSection = document.getElementById('dashboard');
if (defaultSection) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  defaultSection.classList.remove('hidden');
}
