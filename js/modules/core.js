// ============================================
// CORE: State, DOM, Utils
// ============================================

// ---- STATE ----
export const state = {
  temperature: 0,
  sensorLight: 0,
  lampState: false,
  mode: 'manual',
  plantStartDate: null,
  alert: '',
  unlocked: false
};

export let currentUser = null;
export function setUser(user) { currentUser = user; }

// ---- DOM ----
export const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) console.warn(`Element #${id} not found!`);
  return el;
};

export const DOM = {};

export function initDOM() {
  const ids = [
    'connStatus', 'monitorTemp', 'monitorLight', 'monitorLampStatus',
    'btnOn', 'btnOff', 'controlSection',
    'dashTemp', 'dashLight', 'dashLampStatus',
    'dashTempStatus', 'dashLightStatus', 'dashLampLabel',
    'dashConnStatus', 'dashDataCount', 'dashLastUpdate',
    'adminMenu', 'userList', 'addUserForm', 'addUserMsg',
    'userName',
    'growthMode', 'applyModeBtn',
    'currentModeDisplay', 'modeDurationDisplay',
    'modeIcon', 'modeName', 'modeDuration',
    'dayCounter', 'timelineMessage', 'resetPlantBtn',
    'exportPeriod', 'exportBtn', 'exportStatus', 'exportPdfBtn',
    'overheatContainer', 'overheatMessage', 'lampStateText',
    'statTemp', 'statTempStatus', 'statLight', 'statLightStatus',
    'statLamp', 'statLampIcon', 'statDay', 'statDayLabel', 'statModeLabel',
    'chartStatus', 'dashMaxTemp'
  ];
  ids.forEach(id => { DOM[id] = $(id); });
}

// ---- UTILS ----
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
    const d = new Date(ts.replace('T', ' ').replace(/-/g, '/'));
    return d.toLocaleString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch(e) { return ts; }
}
