// ============================================
// MAIN ENTRY – app.js (FIXED)
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

// ===== APP START =====
document.addEventListener("DOMContentLoaded", () => {
  initDOM();
  initAdminPanel();
  initCharts();
  initFirebase();
  initControls();
  initExpandChart();
  initModeControls();
  
  // Export buttons
  if (DOM.exportBtn && DOM.exportPeriod) {
    DOM.exportBtn.addEventListener('click', () => exportData(DOM.exportPeriod.value));
  }
  if (DOM.exportPdfBtn) {
    DOM.exportPdfBtn.addEventListener('click', exportPDF);
  }
  
  // Load history
  loadChartHistory();
  
  // Clock
  updateClock();
  setInterval(updateClock, 1000);
  
  // Show user info
  if (DOM.userName) {
    DOM.userName.textContent = `👋 ${currentUser?.nama || 'User'}`;
  }
  
  console.log("🚀 App siap!");
});

// ===== FIREBASE LISTENERS =====
function initFirebase() {
  // Sensor (realtime)
  onValue(ref(db, 'sensor'), (snap) => {
    const d = snap.val();
    if (d) {
      state.temperature = d.suhu || 0;
      state.sensorLight = Math.min(100, Math.round((d.cahaya || 0) / 5000 * 100));
      const time = new Date().toLocaleTimeString();
      updateCharts(time);
    }
    renderUI();
  }, (err) => {
    console.error("❌ Sensor error:", err);
    if (DOM.connStatus) {
      DOM.connStatus.innerText = "Disconnected";
      DOM.connStatus.style.color = "#ef4444";
    }
  });
  
  // Control
  onValue(ref(db, 'control'), (snap) => {
    const d = snap.val();
    if (d?.lamp) {
      state.lampState = d.lamp.state || false;
      state.mode = d.lamp.mode || 'manual';
    }
    renderUI();
  });
  
  // System
  onValue(ref(db, 'system'), (snap) => {
    const d = snap.val();
    if (d) {
      state.plantStartDate = d.plant_start_date || null;
      state.alert = d.alert || '';
      state.controlMode = d.control_mode || 'otomatis';
      state.totalJam = d.total_jam || 14;
      state.cycleOn = d.cycle_on || 15;
      state.cycleOff = d.cycle_off || 15;
      state.luxThreshold = d.lux_threshold || 500;
      state.forceDayOn = d.force_day_on || false;
      state.jadwalStart = d.jadwal_start || 6;
      state.jadwalEnd = d.jadwal_end || 18;
      
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
      
      // Update UI tombol mode sesuai state
      updateModeButtonUI(state.controlMode);
    }
    renderUI();
  });
}

// ===== UPDATE UI TOMBOL MODE =====
function updateModeButtonUI(mode) {
  document.querySelectorAll('.mode-btn').forEach(btn => {
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
        .then(() => { state.lampState = true; renderUI(); })
        .catch(err => showToast('❌ Gagal ON: ' + err.message, 'error'));
    });
  }
  if (DOM.btnOff) {
    DOM.btnOff.addEventListener('click', () => {
      set(ref(db, 'control/lamp/state'), false)
        .then(() => { state.lampState = false; renderUI(); })
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
        renderUI();
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
      renderUI();
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
      renderUI();
      showToast('✅ Tanaman di-reset!', 'success');
    });
  }
}

// ===== MODE KONTROL (FIXED) =====
function initModeControls() {
  if (DOM.modeAutoBtn) {
    DOM.modeAutoBtn.addEventListener('click', () => {
      console.log("🟢 [Tombol] Otomatis diklik");
      setModeControl('otomatis');
    });
  }
  if (DOM.modeJadwalBtn) {
    DOM.modeJadwalBtn.addEventListener('click', () => {
      console.log("🟢 [Tombol] Jadwal diklik");
      setModeControl('jadwal');
    });
  }
  if (DOM.modeManualBtn) {
    DOM.modeManualBtn.addEventListener('click', () => {
      console.log("🟢 [Tombol] Manual diklik");
      setModeControl('manual');
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

// ===== SET MODE CONTROL (FIXED WITH DEBUG) =====
function setModeControl(mode) {
  console.log("🟢 [setModeControl] Dipanggil dengan mode:", mode);
  
  if (!db) {
    console.error("❌ Firebase database tidak terdefinisi!");
    showToast('❌ Firebase tidak terhubung!', 'error');
    return;
  }
  
  set(ref(db, 'system/control_mode'), mode)
    .then(() => {
      console.log("✅ [setModeControl] Berhasil disimpan ke Firebase:", mode);
      state.controlMode = mode;
      
      if (DOM.currentModeDisplay2) {
        const labels = { otomatis: '🤖 Otomatis (Lux)', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
        DOM.currentModeDisplay2.textContent = labels[mode] || mode;
      }
      
      updateModeButtonUI(mode);
      showToast(`✅ Mode ${mode} aktif`, 'success');
    })
    .catch(err => {
      console.error("❌ [setModeControl] Gagal simpan ke Firebase:", err);
      showToast('❌ Gagal: ' + err.message, 'error');
    });
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

// ===== SIDEBAR NAVIGATION =====
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', function(e) {
    e.preventDefault();
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    this.classList.add('active');
    
    const target = this.dataset.target;
    document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
    const targetSection = document.getElementById(target);
    if (targetSection) targetSection.classList.remove('hidden');
    
    if (window.innerWidth <= 768) closeMenu();
  });
});

// ===== DEFAULT SECTION =====
const defaultSection = document.getElementById('dashboard');
if (defaultSection) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  defaultSection.classList.remove('hidden');
}
