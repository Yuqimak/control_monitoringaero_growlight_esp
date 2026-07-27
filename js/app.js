// ============================================
// MAIN ENTRY – app.js (DENGAN FITUR BARU)
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
  initModeControls(); // 🔥 FITUR BARU
  
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
  
  // System (untuk fitur baru)
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
    }
    renderUI();
  });
}

// ===== CONTROLS (EXISTING) =====
function initControls() {
  // ON/OFF
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
  
  // MODE PERTUMBUHAN (LAMA)
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
  
  // RESET TANAM
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

// ===== 🔥 FITUR BARU: MODE KONTROL (JADWAL, LUX, REPEAT CYCLE) =====
function initModeControls() {
  // 1. Pilih Mode Kontrol (Otomatis/Jadwal/Manual)
  const modeAutoBtn = document.getElementById('modeAutoBtn');
  const modeJadwalBtn = document.getElementById('modeJadwalBtn');
  const modeManualBtn = document.getElementById('modeManualBtn');
  
  if (modeAutoBtn) {
    modeAutoBtn.addEventListener('click', () => {
      setModeControl('otomatis');
    });
  }
  if (modeJadwalBtn) {
    modeJadwalBtn.addEventListener('click', () => {
      setModeControl('jadwal');
    });
  }
  if (modeManualBtn) {
    modeManualBtn.addEventListener('click', () => {
      setModeControl('manual');
    });
  }
  
  // 2. Simpan Total Jam (Repeat Cycle)
  const totalJamInput = document.getElementById('totalJam');
  const saveTotalJamBtn = document.getElementById('saveTotalJamBtn');
  if (saveTotalJamBtn && totalJamInput) {
    saveTotalJamBtn.addEventListener('click', () => {
      const val = parseInt(totalJamInput.value);
      if (val < 1 || val > 18) {
        showToast('❌ Total jam harus 1-18 jam', 'error');
        return;
      }
      set(ref(db, 'system/total_jam'), val)
        .then(() => showToast('✅ Total jam disimpan!', 'success'))
        .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
    });
  }
  
  // 3. Simpan Lux Threshold
  const luxThresholdInput = document.getElementById('luxThreshold');
  const saveThresholdBtn = document.getElementById('saveThresholdBtn');
  if (saveThresholdBtn && luxThresholdInput) {
    saveThresholdBtn.addEventListener('click', () => {
      const val = parseInt(luxThresholdInput.value);
      if (val < 0 || val > 5000) {
        showToast('❌ Threshold harus 0-5000 lux', 'error');
        return;
      }
      set(ref(db, 'system/lux_threshold'), val)
        .then(() => showToast('✅ Threshold lux disimpan!', 'success'))
        .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
    });
    
    // Preview slider
    luxThresholdInput.addEventListener('input', (e) => {
      const display = document.getElementById('luxThresholdDisplay');
      if (display) display.textContent = e.target.value + ' lux';
    });
  }
  
  // 4. Force Day ON (checkbox)
  const forceDayOnCheck = document.getElementById('forceDayOn');
  if (forceDayOnCheck) {
    forceDayOnCheck.addEventListener('change', () => {
      set(ref(db, 'system/force_day_on'), forceDayOnCheck.checked)
        .then(() => showToast(forceDayOnCheck.checked ? '☀️ Force Day ON aktif' : '🌙 Force Day OFF', 'info'))
        .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
    });
  }
  
  // 5. Simpan Jadwal (jam nyala-mati)
  const jadwalStart = document.getElementById('jadwalStart');
  const jadwalEnd = document.getElementById('jadwalEnd');
  const saveJadwalBtn = document.getElementById('saveJadwalBtn');
  if (saveJadwalBtn && jadwalStart && jadwalEnd) {
    saveJadwalBtn.addEventListener('click', () => {
      const start = parseInt(jadwalStart.value);
      const end = parseInt(jadwalEnd.value);
      if (start < 0 || start > 23 || end < 0 || end > 23) {
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

// ===== FUNGSI SET MODE KONTROL =====
function setModeControl(mode) {
  set(ref(db, 'system/control_mode'), mode)
    .then(() => {
      state.controlMode = mode;
      const display = document.getElementById('currentModeDisplay');
      if (display) {
        const labels = { otomatis: '🤖 Otomatis (Lux)', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
        display.textContent = labels[mode] || mode;
      }
      // Update tombol
      document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.style.background = 'rgba(255,255,255,0.1)';
        btn.style.border = '1px solid rgba(255,255,255,0.1)';
      });
      const activeBtn = document.getElementById(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}Btn`);
      if (activeBtn) {
        activeBtn.style.background = '#22c55e';
        activeBtn.style.border = '1px solid #22c55e';
      }
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

// ===== SIDEBAR TOGGLE =====
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
