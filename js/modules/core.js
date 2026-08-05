// ============================================
// CORE: State, DOM, Utils (FULLY FIXED)
// ============================================

export const state = {
  temperature: 0,
  sensorLight: 0,
  lampState: false,
  mode: 'manual',
  plantStartDate: null,
  alert: '',
  unlocked: false,
  // 🔥 FITUR KONTROL
  controlMode: 'otomatis',
  totalJam: 14,
  cycleOn: 15,
  cycleOff: 15,
  luxThreshold: 500,
  forceDayOn: false,
  jadwalStart: 6,
  jadwalEnd: 18,
  // 🔥 FITUR KEBUTUHAN CAHAYA
  totalLightNeeded: 12,
  accumulatedLight: 0,
  lastResetDate: ''
};

export let currentUser = null;
export function setUser(user) { currentUser = user; }

export const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) console.warn(`Element #${id} not found!`);
  return el;
};

export const DOM = {};

export function initDOM() {
  const ids = [
    // Topbar
    'connStatus', 'userName', 'dateText', 'clockText', 'menuToggle',
    // Quick Stats
    'statTemp', 'statTempStatus', 'statLight', 'statLightStatus',
    'statLamp', 'statLampIcon', 'statDay', 'statDayLabel', 'statModeLabel',
    'statLightProgress',
    // Dashboard
    'dashLampStatus',   // 🔥 BARU: status lampu di dashboard
    'dashLatestTemp',   // 🔥 BARU: suhu terbaru di dashboard
    'modeIcon', 'modeName', 'modeDuration', 'dayCounter', 'timelineMessage',
    'dashConnStatus', 'dashDataCount', 'dashLastUpdate', 'dashMaxTemp',
    'dashTempChart', 'chartStatus',
    // Overheat
    'overheatContainer', 'overheatMessage',
    // Monitoring
    'monitorTemp', 'monitorLight', 'monitorLampStatus',
    'tempStatus', 'lightStatus', 'lampStatusText',
    // Control
    'btnOn', 'btnOff', 'lampStateText',
    'growthMode', 'applyModeBtn',
    'currentModeDisplay', 'modeDurationDisplay',
    'resetPlantBtn', 'controlSection',
    // Mode Control
    'modeAutoBtn', 'modeJadwalBtn', 'modeManualBtn',
    'currentModeDisplay2',
    // Repeat Cycle (masih dipertahankan untuk kompatibilitas)
    'totalJam', 'saveTotalJamBtn',
    // Lux Threshold
    'luxThreshold', 'saveThresholdBtn', 'luxThresholdDisplay',
    // Force Day On
    'forceDayOn',
    // Jadwal
    'jadwalStart', 'jadwalEnd', 'saveJadwalBtn',
    // KEBUTUHAN CAHAYA
    'totalLightNeeded', 'saveLightNeededBtn', 
    'sunlightHours', 'growlightHours', 'lightProgressDisplay',
    // Admin
    'adminMenu', 'userList', 'addUserForm', 'addUserMsg',
    'newUsername', 'newPassword', 'newNama', 'newRole',
    // Export
    'exportStatus', 'exportBtn', 'exportPdfBtn', 'exportPeriod'
  ];
  ids.forEach(id => { DOM[id] = $(id); });
}

export function animateValue(el, start, end, duration = 300) {
  if (!el) return;
  let startTime = null;
  function animate(t) {
    if (!startTime) startTime = t;
    const p = Math.min((t - startTime) / duration, 1);
    el.innerText = Math.floor(p * (end - start) + start);
    if (p < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

export function showToast(msg, type = 'info') {
  const colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b' };
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
    background:#1e293b; color:#fff; padding:14px 24px; border-radius:14px;
    font-weight:600; z-index:9999; border-left:4px solid ${colors[type] || '#22c55e'};
    max-width:90%; text-align:center; font-size:15px;
    animation:slideUp 0.4s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export function formatTime(ts) {
  try {
    if (!ts) return '-';
    if (typeof ts === 'string' && ts.includes('T')) {
      const d = new Date(ts.replace(/-/g, '/').replace('T', ' '));
      if (isNaN(d.getTime())) return ts;
      return d.toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch(e) { return ts; }
}