// ============================================
// UI: Dashboard, Monitoring, Control
// ============================================

import { state, DOM, animateValue, showToast } from './core.js';

// ---- MODE CONFIG ----
const MODE_CONFIG = {
  bibit:   { icon: '🌱', label: 'Bibit', duration: 4 },
  vegetatif: { icon: '🌿', label: 'Vegetatif', duration: 14 },
  generatif: { icon: '🥔', label: 'Generatif', duration: 12 },
  panen:   { icon: '🌾', label: 'Panen', duration: 9 },
  manual:  { icon: '🎛', label: 'Manual', duration: null }
};

export function getModeConfig(key) {
  return MODE_CONFIG[key] || MODE_CONFIG.manual;
}

export function getDays() {
  if (!state.plantStartDate) return 0;
  return Math.floor((Date.now() - new Date(state.plantStartDate)) / 86400000);
}

export function getReminder(days) {
  if (days >= 7 && days < 10) return '🌱 Bibit siap pindah ke Vegetatif!';
  if (days >= 28 && days < 31) return '🌿 Vegetatif siap pindah ke Generatif!';
  if (days >= 56 && days < 59) return '🥔 Generatif siap pindah ke Panen!';
  if (days >= 70) return '🌾 Waktunya panen! Kentang siap dipetik!';
  return null;
}

// ---- RENDER UI ----
export function renderUI() {
  const { temperature, sensorLight, lampState, mode, alert } = state;
  
  // Monitoring cards
  if (DOM.monitorTemp) {
    animateValue(DOM.monitorTemp, Number(DOM.monitorTemp.innerText) || 0, temperature);
  }
  if (DOM.monitorLight) {
    animateValue(DOM.monitorLight, Number(DOM.monitorLight.innerText) || 0, sensorLight);
  }
  
  // Status lampu
  const statusText = lampState ? 'ON' : 'OFF';
  const color = lampState ? '#22c55e' : '#ef4444';
  if (DOM.monitorLampStatus) {
    DOM.monitorLampStatus.innerText = statusText;
    DOM.monitorLampStatus.style.color = color;
  }
  if (DOM.lampStateText) {
    DOM.lampStateText.innerText = statusText;
    DOM.lampStateText.style.color = color;
  }
  if (DOM.connStatus) {
    DOM.connStatus.innerText = 'Realtime Connected';
    DOM.connStatus.style.color = '#22c55e';
  }
  
  updateStatusText();
  updateDashboard();
  updateModeUI();
  updateOverheat();
}

// ---- DASHBOARD ----
function updateDashboard() {
  const { temperature, sensorLight, lampState, mode } = state;
  const days = getDays();
  const config = getModeConfig(mode || 'manual');
  
  // Sensor cards
  if (DOM.dashTemp) DOM.dashTemp.innerText = temperature;
  if (DOM.dashLight) DOM.dashLight.innerText = sensorLight;
  if (DOM.dashLampStatus) {
    DOM.dashLampStatus.innerText = lampState ? 'ON' : 'OFF';
    DOM.dashLampStatus.style.color = lampState ? '#22c55e' : '#ef4444';
  }
  
  // Status labels
  if (DOM.dashTempStatus) {
    const t = temperature;
    if (t > 35) {
      DOM.dashTempStatus.innerText = '🔥 Panas';
      DOM.dashTempStatus.style.color = '#ef4444';
    } else if (t > 28) {
      DOM.dashTempStatus.innerText = '🌤️ Hangat';
      DOM.dashTempStatus.style.color = '#f59e0b';
    } else if (t > 20) {
      DOM.dashTempStatus.innerText = '✅ Normal';
      DOM.dashTempStatus.style.color = '#22c55e';
    } else {
      DOM.dashTempStatus.innerText = '❄️ Dingin';
      DOM.dashTempStatus.style.color = '#3b82f6';
    }
  }
  
  if (DOM.dashLightStatus) {
    const l = sensorLight;
    if (l > 80) {
      DOM.dashLightStatus.innerText = '☀️ Terang';
      DOM.dashLightStatus.style.color = '#facc15';
    } else if (l > 50) {
      DOM.dashLightStatus.innerText = '🌤️ Sedang';
      DOM.dashLightStatus.style.color = '#f59e0b';
    } else if (l > 20) {
      DOM.dashLightStatus.innerText = '🌥️ Redup';
      DOM.dashLightStatus.style.color = '#94a3b8';
    } else {
      DOM.dashLightStatus.innerText = '🌙 Gelap';
      DOM.dashLightStatus.style.color = '#64748b';
    }
  }
  
  if (DOM.dashLampLabel) {
    DOM.dashLampLabel.innerText = lampState ? 'Aktif' : 'Mati';
    DOM.dashLampLabel.style.color = lampState ? '#22c55e' : '#ef4444';
  }
  
  // Quick stats
  if (DOM.statTemp) DOM.statTemp.textContent = temperature.toFixed(1);
  if (DOM.statLight) DOM.statLight.textContent = sensorLight;
  if (DOM.statLamp) {
    DOM.statLamp.innerText = lampState ? 'ON' : 'OFF';
    DOM.statLamp.style.color = lampState ? '#22c55e' : '#ef4444';
    if (DOM.statLampIcon) {
      DOM.statLampIcon.style.color = lampState ? '#22c55e' : '#ef4444';
      DOM.statLampIcon.style.background = lampState ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
    }
  }
  if (DOM.statDay) DOM.statDay.textContent = days;
  if (DOM.statDayLabel) DOM.statDayLabel.textContent = days;
  if (DOM.statModeLabel) DOM.statModeLabel.textContent = config.label;
  
  // System status
  if (DOM.dashConnStatus) {
    DOM.dashConnStatus.innerText = '● Online';
    DOM.dashConnStatus.style.color = '#22c55e';
  }
  if (DOM.dashLastUpdate) {
    DOM.dashLastUpdate.innerText = new Date().toLocaleTimeString('id-ID');
  }
  if (DOM.dashDataCount) {
    DOM.dashDataCount.innerText = document.querySelectorAll('#tempChart').length;
  }
}

// ---- MODE UI ----
export function updateModeUI() {
  const config = getModeConfig(state.mode || 'manual');
  const days = getDays();
  
  if (DOM.modeIcon) DOM.modeIcon.textContent = config.icon;
  if (DOM.modeName) DOM.modeName.textContent = config.label;
  if (DOM.modeDuration) DOM.modeDuration.textContent = config.duration !== null ? config.duration : '-';
  if (DOM.dayCounter) DOM.dayCounter.textContent = days;
  
  if (DOM.timelineMessage) {
    const reminder = getReminder(days);
    if (reminder) {
      DOM.timelineMessage.textContent = '🔔 ' + reminder;
      DOM.timelineMessage.style.color = '#facc15';
    } else if (days === 0) {
      DOM.timelineMessage.textContent = '🌱 Mulai tanam untuk tracking';
      DOM.timelineMessage.style.color = 'var(--muted)';
    } else {
      DOM.timelineMessage.textContent = `✅ Mode ${config.label} aktif (hari ke-${days})`;
      DOM.timelineMessage.style.color = '#22c55e';
    }
  }
  
  if (DOM.currentModeDisplay) {
    DOM.currentModeDisplay.textContent = `Mode: ${config.icon} ${config.label}`;
  }
  if (DOM.modeDurationDisplay) {
    DOM.modeDurationDisplay.textContent = `Durasi: ${config.duration !== null ? config.duration + ' jam' : 'Manual'}`;
  }
  if (DOM.growthMode) {
    DOM.growthMode.value = state.mode || 'manual';
  }
}

// ---- STATUS TEXT ----
function updateStatusText() {
  const t = state.temperature;
  const l = state.sensorLight;
  const tempEl = document.getElementById('tempStatus');
  const lightEl = document.getElementById('lightStatus');
  const lampEl = document.getElementById('lampStatusText');
  
  if (tempEl) {
    if (t > 35) {
      tempEl.innerText = '🔥 Sangat Panas';
      tempEl.style.color = '#ef4444';
    } else if (t > 28) {
      tempEl.innerText = '🔥 Panas';
      tempEl.style.color = '#f59e0b';
    } else if (t > 20) {
      tempEl.innerText = '🌤️ Normal';
      tempEl.style.color = '#22c55e';
    } else {
      tempEl.innerText = '❄️ Dingin';
      tempEl.style.color = '#3b82f6';
    }
  }
  
  if (lightEl) {
    if (l > 80) {
      lightEl.innerText = '☀️ Sangat Terang';
      lightEl.style.color = '#facc15';
    } else if (l > 50) {
      lightEl.innerText = '🌤️ Intensitas Sedang';
      lightEl.style.color = '#f59e0b';
    } else if (l > 20) {
      lightEl.innerText = '🌥️ Redup';
      lightEl.style.color = '#94a3b8';
    } else {
      lightEl.innerText = '🌙 Gelap';
      lightEl.style.color = '#64748b';
    }
  }
  
  if (lampEl) {
    lampEl.innerText = state.lampState ? '💡 Lampu Aktif' : '⛔ Lampu Mati';
    lampEl.style.color = state.lampState ? '#22c55e' : '#ef4444';
  }
}

// ---- OVERHEAT ----
function updateOverheat() {
  if (!DOM.overheatContainer || !DOM.overheatMessage) return;
  if (state.alert && state.alert.includes('Overheat')) {
    DOM.overheatContainer.style.display = 'block';
    DOM.overheatContainer.classList.add('active');
    DOM.overheatMessage.textContent = state.alert;
  } else {
    DOM.overheatContainer.style.display = 'none';
    DOM.overheatContainer.classList.remove('active');
  }
}
