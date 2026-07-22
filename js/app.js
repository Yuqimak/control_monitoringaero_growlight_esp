import { db } from "./firebase.js";

import {
  ref,
  onValue,
  set,
  get,
  update,
  push,
  query,
  orderByKey,
  limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* ============================================
   SESSION & AUTH CHECK
============================================ */

let currentUser = null;
const sessionData = localStorage.getItem('iot_user');
if (!sessionData) {
  window.location.href = 'login.html';
} else {
  try {
    currentUser = JSON.parse(sessionData);
    console.log('👤 Login sebagai:', currentUser.nama, '(', currentUser.username, ')', 'Role:', currentUser.role);
    const loginTime = currentUser.loginTime || 0;
    const expired = (Date.now() - loginTime) > 8 * 60 * 60 * 1000;
    if (expired) {
      localStorage.removeItem('iot_user');
      window.location.href = 'login.html';
    }
  } catch(e) {
    localStorage.removeItem('iot_user');
    window.location.href = 'login.html';
  }
}

/* ============================================
   APP START
============================================ */

document.addEventListener("DOMContentLoaded", () => {

  const state = {
    temperature: 0,
    sensorLight: 0,
    lampState: false,
    mode: 'manual',
    plantStartDate: null,
    alert: ''
  };

  /* ========================================
     DOM
  ======================================== */

  const getEl = (id) => {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element #${id} not found!`);
    return el;
  };

  const connStatus = getEl("connStatus");
  const monitorTemp = getEl("monitorTemp");
  const monitorLight = getEl("monitorLight");
  const monitorLampStatus = getEl("monitorLampStatus");
  const btnOn = getEl("btnOn");
  const btnOff = getEl("btnOff");
  const controlSection = getEl("controlSection");
  const dashTemp = getEl("dashTemp");
  const dashLight = getEl("dashLight");
  const dashLampStatus = getEl("dashLampStatus");
  const dashTempStatus = getEl("dashTempStatus");
  const dashLightStatus = getEl("dashLightStatus");
  const dashLampLabel = getEl("dashLampLabel");
  const dashConnStatus = getEl("dashConnStatus");
  const dashDataCount = getEl("dashDataCount");
  const dashLastUpdate = getEl("dashLastUpdate");
  const adminMenu = document.getElementById('adminMenu');
  const userList = document.getElementById('userList');
  const addUserForm = document.getElementById('addUserForm');
  const addUserMsg = document.getElementById('addUserMsg');
  const userNameEl = document.getElementById("userName");

  const growthModeSelect = getEl("growthMode");
  const applyModeBtn = getEl("applyModeBtn");
  const currentModeDisplay = getEl("currentModeDisplay");
  const modeDurationDisplay = getEl("modeDurationDisplay");
  const modeIcon = getEl("modeIcon");
  const modeName = getEl("modeName");
  const modeDuration = getEl("modeDuration");
  const dayCounter = getEl("dayCounter");
  const timelineMessage = getEl("timelineMessage");
  const resetPlantBtn = getEl("resetPlantBtn");

  const exportPeriod = getEl("exportPeriod");
  const exportBtn = getEl("exportBtn");
  const exportStatus = getEl("exportStatus");
  const exportPdfBtn = getEl("exportPdfBtn");

  const overheatContainer = document.getElementById('overheatContainer');
  const overheatMessage = document.getElementById('overheatMessage');
  const lampStateText = document.getElementById("lampStateText");

  /* ========================================
     ADMIN MENU
  ======================================== */
  if (currentUser && currentUser.role === 'admin') {
    if (adminMenu) adminMenu.style.display = 'block';
  } else {
    if (adminMenu) adminMenu.style.display = 'none';
  }

  /* ========================================
     MODE CONFIGURATION
  ======================================== */
  const MODE_CONFIG = {
    bibit:   { icon: '🌱', label: 'Bibit', duration: 4 },
    vegetatif: { icon: '🌿', label: 'Vegetatif', duration: 14 },
    generatif: { icon: '🥔', label: 'Generatif', duration: 12 },
    panen:   { icon: '🌾', label: 'Panen', duration: 9 },
    manual:  { icon: '🎛', label: 'Manual', duration: null }
  };

  function getModeConfig(modeKey) {
    return MODE_CONFIG[modeKey] || MODE_CONFIG.manual;
  }

  function getDaysSincePlanting() {
    if (!state.plantStartDate) return 0;
    const start = new Date(state.plantStartDate);
    const now = new Date();
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
  }

  function getReminderMessage(days) {
    if (days >= 7 && days < 10) return '🌱 Bibit siap pindah ke Vegetatif!';
    if (days >= 28 && days < 31) return '🌿 Vegetatif siap pindah ke Generatif!';
    if (days >= 56 && days < 59) return '🥔 Generatif siap pindah ke Panen!';
    if (days >= 70) return '🌾 Waktunya panen! Kentang siap dipetik!';
    return null;
  }

  /* ========================================
     CHART
  ======================================== */
  const MAX_DATA_POINTS = 100; // 24 jam (interval 30 detik = ~50 data, 100 aman)
  const tempLabels = [], tempData = [], lightLabels = [], sensorData = [];
  let lampStatusChart = null;

  const tempChartEl = document.getElementById("tempChart");
  let tempChart = null;
  if (tempChartEl) {
    tempChart = new Chart(tempChartEl, {
      type: "line",
      data: { labels: tempLabels, datasets: [{ label: "Temperature (°C)", data: tempData, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.2)", borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 }] },
      options: { responsive: true, plugins: { legend: { labels: { color: "#cbd5e1" } } }, scales: { x: { ticks: { color: "#94a3b8" } }, y: { ticks: { color: "#94a3b8" } } } }
    });
  }

  const lightChartEl = document.getElementById("lightChart");
  let lightChart = null;
  if (lightChartEl) {
    lightChart = new Chart(lightChartEl, {
      type: "line",
      data: { labels: lightLabels, datasets: [{ label: "Sensor Light (%)", data: sensorData, borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.2)", borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 }] },
      options: { responsive: true, plugins: { legend: { labels: { color: "#cbd5e1" } } }, scales: { x: { ticks: { color: "#94a3b8" } }, y: { ticks: { color: "#94a3b8" } } } }
    });
  }

  // ===== BAR CHART UNTUK STATUS LAMPU (FIX Y-AXIS) =====
  const lampStatusChartEl = document.getElementById('lampStatusChart');
  if (lampStatusChartEl) {
    lampStatusChart = new Chart(lampStatusChartEl, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Status Lampu',
          data: [],
          backgroundColor: function(context) {
            const value = context.dataset.data[context.dataIndex];
            return value === 1 ? '#22c55e' : '#ef4444';
          },
          borderColor: 'rgba(255,255,255,0.2)',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#cbd5e1', display: false } },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.parsed.y === 1 ? 'ON' : 'OFF';
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#94a3b8', maxTicksLimit: 10 },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            ticks: {
              color: '#94a3b8',
              stepSize: 1,
              callback: function(value) {
                return value === 1 ? 'ON' : 'OFF';
              }
            },
            min: -0.5,
            max: 1.5,
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
  }

  const dashTempLabels = [], dashTempData = [];
  const dashTempChartEl = document.getElementById("dashTempChart");
  let dashTempChart = null;
  if (dashTempChartEl) {
    dashTempChart = new Chart(dashTempChartEl, {
      type: "line",
      data: { labels: dashTempLabels, datasets: [{ label: "Suhu (°C)", data: dashTempData, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.15)", borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
  }

  /* ========================================
     LOAD CHART HISTORY
  ======================================== */
  async function loadChartHistory() {
    try {
      const suhuSnap = await get(query(ref(db, 'sensor_history/suhu'), orderByKey(), limitToLast(MAX_DATA_POINTS)));
      const cahayaSnap = await get(query(ref(db, 'sensor_history/cahaya'), orderByKey(), limitToLast(MAX_DATA_POINTS)));
      const lampuSnap = await get(query(ref(db, 'sensor_history/lampu'), orderByKey(), limitToLast(MAX_DATA_POINTS)));

      const suhuData = suhuSnap.val() || {};
      const cahayaData = cahayaSnap.val() || {};
      const lampuData = lampuSnap.val() || {};

      const keys = Object.keys(suhuData).sort();

      // Reset semua data
      tempLabels.length = 0;
      tempData.length = 0;
      sensorData.length = 0;
      dashTempLabels.length = 0;
      dashTempData.length = 0;
      if (lampStatusChart) {
        lampStatusChart.data.labels = [];
        lampStatusChart.data.datasets[0].data = [];
      }

      keys.forEach(key => {
        const parts = key.replace('T', ' ').split(' ');
        const date = parts[0].split('-').slice(2).join('-');
        const time = parts[1].split('-').slice(0, 2).join(':');
        const label = date + ' ' + time;

        // Normalisasi cahaya ke persentase (asumsi max 5000 lux)
        const rawCahaya = cahayaData[key]?.value || 0;
        const normalizedCahaya = Math.min(100, Math.round(rawCahaya / 5000 * 100));

        // Analytics charts
        tempLabels.push(label);
        tempData.push(suhuData[key]?.value || 0);
        sensorData.push(normalizedCahaya);

        if (lampStatusChart) {
          lampStatusChart.data.labels.push(label);
          lampStatusChart.data.datasets[0].data.push(lampuData[key]?.state ? 1 : 0);
        }

        // Dashboard mini chart
        dashTempLabels.push(label);
        dashTempData.push(suhuData[key]?.value || 0);
      });

      if (tempChart) tempChart.update();
      if (lightChart) lightChart.update();
      if (lampStatusChart) lampStatusChart.update();
      if (dashTempChart) dashTempChart.update();
    } catch (e) { console.warn('Could not load chart history:', e); }
  }

  /* ========================================
     USER INFO & LOGOUT
  ======================================== */
  function showUserInfo() {
    try {
      const user = JSON.parse(localStorage.getItem('iot_user') || '{}');
      if (userNameEl) userNameEl.textContent = `👋 ${user.nama || 'User'}`;
    } catch(e) {}
  }
  showUserInfo();

  window.logout = function() {
    if (confirm('Yakin mau logout?')) {
      localStorage.removeItem('iot_user');
      window.location.href = 'login.html';
    }
  };

  /* ========================================
     ANIMATE VALUE
  ======================================== */
  function animateValue(el, start, end, duration = 300) {
    if (!el) return;
    let startTime = null;
    function animate(currentTime) {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const value = Math.floor(progress * (end - start) + start);
      el.innerText = value;
      if (progress < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  /* ========================================
     UPDATE STATUS TEXT
  ======================================== */
  function updateStatusText() {
    const tempStatus = document.getElementById("tempStatus");
    if (tempStatus) {
      const temp = state.temperature;
      if (temp > 35) { tempStatus.innerText = "🔥 Sangat Panas";
        tempStatus.style.color = "#ef4444"; } else if (temp > 28) { tempStatus.innerText = "🔥 Panas";
        tempStatus.style.color = "#f59e0b"; } else if (temp > 20) { tempStatus.innerText = "🌤️ Normal";
        tempStatus.style.color = "#22c55e"; } else { tempStatus.innerText = "❄️ Dingin";
        tempStatus.style.color = "#3b82f6"; }
    }

    const lightStatus = document.getElementById("lightStatus");
    if (lightStatus) {
      const light = state.sensorLight;
      if (light > 80) { lightStatus.innerText = "☀️ Sangat Terang";
        lightStatus.style.color = "#facc15"; } else if (light > 50) { lightStatus.innerText = "🌤️ Intensitas Sedang";
        lightStatus.style.color = "#f59e0b"; } else if (light > 20) { lightStatus.innerText = "🌥️ Redup";
        lightStatus.style.color = "#94a3b8"; } else { lightStatus.innerText = "🌙 Gelap";
        lightStatus.style.color = "#64748b"; }
    }

    const lampStatusText = document.getElementById("lampStatusText");
    if (lampStatusText) {
      if (state.lampState) {
        lampStatusText.innerText = "💡 Lampu Aktif";
        lampStatusText.style.color = "#22c55e";
      } else {
        lampStatusText.innerText = "⛔ Lampu Mati";
        lampStatusText.style.color = "#ef4444";
      }
    }
  }

  function updateOverheat() {
    if (!overheatContainer || !overheatMessage) return;
    if (state.alert && state.alert.includes('Overheat')) {
      overheatContainer.style.display = 'block';
      overheatContainer.classList.add('active');
      overheatMessage.textContent = state.alert;
    } else {
      overheatContainer.style.display = 'none';
      overheatContainer.classList.remove('active');
    }
  }

  function renderUI() {
    if (monitorTemp) animateValue(monitorTemp, Number(monitorTemp.innerText) || 0, state.temperature);
    if (monitorLight) animateValue(monitorLight, Number(monitorLight.innerText) || 0, state.sensorLight);
    const lampStatusText = state.lampState ? "ON" : "OFF";
    const lampColor = state.lampState ? "#22c55e" : "#ef4444";
    if (monitorLampStatus) { monitorLampStatus.innerText = lampStatusText;
      monitorLampStatus.style.color = lampColor; }
    if (connStatus) { connStatus.innerText = "Realtime Connected";
      connStatus.style.color = "#22c55e"; }
    if (lampStateText) { lampStateText.innerText = lampStatusText;
      lampStateText.style.color = lampColor; }

    updateStatusText();
    updateDashboard();
    updateDashChart();
    updateModeUI();
    updateOverheat();
  }

  function updateDashboard() {
    if (dashTemp) dashTemp.innerText = state.temperature;
    if (dashLight) dashLight.innerText = state.sensorLight;
    if (dashLampStatus) {
      dashLampStatus.innerText = state.lampState ? "ON" : "OFF";
      dashLampStatus.style.color = state.lampState ? "#22c55e" : "#ef4444";
    }
    if (dashTempStatus) {
      const temp = state.temperature;
      if (temp > 35) { dashTempStatus.innerText = "🔥 Panas";
        dashTempStatus.style.color = "#ef4444"; } else if (temp > 28) { dashTempStatus.innerText = "🌤️ Hangat";
        dashTempStatus.style.color = "#f59e0b"; } else if (temp > 20) { dashTempStatus.innerText = "🌿 Normal";
        dashTempStatus.style.color = "#22c55e"; } else { dashTempStatus.innerText = "❄️ Dingin";
        dashTempStatus.style.color = "#3b82f6"; }
    }
    if (dashLightStatus) {
      const light = state.sensorLight;
      if (light > 80) { dashLightStatus.innerText = "☀️ Terang";
        dashLightStatus.style.color = "#facc15"; } else if (light > 50) { dashLightStatus.innerText = "🌤️ Sedang";
        dashLightStatus.style.color = "#f59e0b"; } else if (light > 20) { dashLightStatus.innerText = "🌥️ Redup";
        dashLightStatus.style.color = "#94a3b8"; } else { dashLightStatus.innerText = "🌙 Gelap";
        dashLightStatus.style.color = "#64748b"; }
    }
    if (dashLampLabel) {
      dashLampLabel.innerText = state.lampState ? "Aktif" : "Mati";
      dashLampLabel.style.color = state.lampState ? "#22c55e" : "#ef4444";
    }
    if (dashConnStatus) { dashConnStatus.innerText = "● Online";
      dashConnStatus.style.color = "#22c55e"; }
    if (dashDataCount) dashDataCount.innerText = tempLabels.length;
    if (dashLastUpdate) {
      const now = new Date();
      dashLastUpdate.innerText = now.toLocaleTimeString('id-ID');
    }

    // ===== QUICK STATS =====
    const statTemp = document.getElementById('statTemp');
    const statTempStatus = document.getElementById('statTempStatus');
    const statLight = document.getElementById('statLight');
    const statLightStatus = document.getElementById('statLightStatus');
    const statLamp = document.getElementById('statLamp');
    const statLampIcon = document.getElementById('statLampIcon');
    const statDay = document.getElementById('statDay');
    const statDayLabel = document.getElementById('statDayLabel');
    const statModeLabel = document.getElementById('statModeLabel');
    const chartStatus = document.getElementById('chartStatus');
    const dashMaxTemp = document.getElementById('dashMaxTemp');

    if (statTemp) statTemp.textContent = state.temperature.toFixed(1);
    if (statTempStatus) {
      const temp = state.temperature;
      if (temp > 35) { statTempStatus.textContent = '🔴 Panas!';
        statTempStatus.style.color = '#ef4444'; } else if (temp > 28) { statTempStatus.textContent = '🟠 Hangat';
        statTempStatus.style.color = '#f59e0b'; } else { statTempStatus.textContent = '✅ Normal';
        statTempStatus.style.color = '#22c55e'; }
    }
    if (statLight) statLight.textContent = state.sensorLight;
    if (statLightStatus) {
      const light = state.sensorLight;
      if (light > 80) { statLightStatus.textContent = '☀️ Terang';
        statLightStatus.style.color = '#facc15'; } else if (light > 50) { statLightStatus.textContent = '🌤️ Sedang';
        statLightStatus.style.color = '#f59e0b'; } else { statLightStatus.textContent = '🌙 Redup';
        statLightStatus.style.color = '#94a3b8'; }
    }
    if (statLamp) {
      statLamp.textContent = state.lampState ? 'ON' : 'OFF';
      statLamp.style.color = state.lampState ? '#22c55e' : '#ef4444';
      if (statLampIcon) {
        statLampIcon.style.color = state.lampState ? '#22c55e' : '#ef4444';
        statLampIcon.style.background = state.lampState ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
      }
    }
    const days = getDaysSincePlanting();
    const config = getModeConfig(state.mode || 'manual');
    if (statDay) statDay.textContent = days;
    if (statDayLabel) statDayLabel.textContent = days;
    if (statModeLabel) statModeLabel.textContent = config.label;

    if (chartStatus) {
      const temp = state.temperature;
      if (temp > 35) chartStatus.textContent = '🔴 Panas!';
      else if (temp > 28) chartStatus.textContent = '🟠 Hangat';
      else chartStatus.textContent = '🟢 Stabil';
    }
    if (dashMaxTemp) {
      const max = Math.max(...tempData.slice(-10));
      dashMaxTemp.textContent = max ? max.toFixed(1) + '°C' : '--°C';
    }
  }

  function updateDashChart() {
    if (dashTempChart) dashTempChart.update();
  }

  function updateModeUI() {
    const modeKey = state.mode || 'manual';
    const config = getModeConfig(modeKey);
    const days = getDaysSincePlanting();

    if (modeIcon) modeIcon.textContent = config.icon;
    if (modeName) modeName.textContent = config.label;
    if (modeDuration) modeDuration.textContent = config.duration !== null ? config.duration : '-';
    if (dayCounter) dayCounter.textContent = days;

    if (timelineMessage) {
      const reminder = getReminderMessage(days);
      if (reminder) {
        timelineMessage.textContent = '🔔 ' + reminder;
        timelineMessage.style.color = '#facc15';
      } else if (days === 0) {
        timelineMessage.textContent = '🌱 Mulai tanam untuk tracking';
        timelineMessage.style.color = 'var(--muted)';
      } else {
        timelineMessage.textContent = `✅ Mode ${config.label} aktif (hari ke-${days})`;
        timelineMessage.style.color = '#22c55e';
      }
    }

    if (currentModeDisplay) { currentModeDisplay.textContent = `Mode: ${config.icon} ${config.label}`; }
    if (modeDurationDisplay) { modeDurationDisplay.textContent = `Durasi: ${config.duration !== null ? config.duration + ' jam' : 'Manual'}`; }
    if (growthModeSelect) { growthModeSelect.value = modeKey; }
  }

  if (applyModeBtn && growthModeSelect) {
    applyModeBtn.addEventListener('click', async () => {
      const mode = growthModeSelect.value;
      const config = getModeConfig(mode);
      if (mode === 'manual') {
        await update(ref(db, 'control/lamp'), { mode: 'manual' });
        state.mode = 'manual';
        updateModeUI();
        alert('🎛 Mode Manual aktif. Kontrol lampu sepenuhnya oleh user.');
        return;
      }
      await update(ref(db, 'control/lamp'), { mode: mode, state: true });
      if (!state.plantStartDate) {
        const now = new Date().toISOString();
        await set(ref(db, 'system/plant_start_date'), now);
        state.plantStartDate = now;
      }
      state.mode = mode;
      state.lampState = true;
      updateModeUI();
      renderUI();
      alert(`✅ Mode ${config.icon} ${config.label} diterapkan! Lampu menyala ${config.duration} jam/hari.`);
    });
  }

  if (resetPlantBtn) {
    resetPlantBtn.addEventListener('click', async () => {
      if (!confirm('🔄 Reset semua data tanam? Aksi ini akan mengatur ulang hari ke-0.')) return;
      await set(ref(db, 'system/plant_start_date'), null);
      await set(ref(db, 'control/lamp/mode'), 'manual');
      state.plantStartDate = null;
      state.mode = 'manual';
      updateModeUI();
      renderUI();
      alert('✅ Tanaman di-reset! Silakan mulai mode baru.');
    });
  }

  /* ========================================
     SAVE HISTORY
  ======================================== */
  let lastSaveTime = 0;
  const SAVE_INTERVAL = 300000;

  function saveHistory() {
    const now = Date.now();
    if (now - lastSaveTime < SAVE_INTERVAL) return;
    lastSaveTime = now;
    const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
    set(ref(db, `sensor_history/suhu/${timestamp}`), { value: state.temperature, timestamp: timestamp });
    set(ref(db, `sensor_history/cahaya/${timestamp}`), { value: state.sensorLight, timestamp: timestamp });
    set(ref(db, `sensor_history/lampu/${timestamp}`), { state: state.lampState, timestamp: timestamp });
  }

  /* ========================================
     EXPORT DATA – CSV RAPI
  ======================================== */
  async function exportData(period) {
    const status = exportStatus;
    if (status) status.textContent = '⏳ Mengambil data...';

    try {
      const now = new Date();
      let startDate;
      if (period === 'week') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
      } else {
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
      }

      const startStr = startDate.toISOString();

      const [suhuSnap, cahayaSnap, lampuSnap] = await Promise.all([
        get(ref(db, 'sensor_history/suhu')),
        get(ref(db, 'sensor_history/cahaya')),
        get(ref(db, 'sensor_history/lampu'))
      ]);

      const suhuData = suhuSnap.val() || {};
      const cahayaData = cahayaSnap.val() || {};
      const lampuData = lampuSnap.val() || {};

      const timestamps = new Set();
      Object.keys(suhuData).forEach(t => timestamps.add(t));
      Object.keys(cahayaData).forEach(t => timestamps.add(t));
      Object.keys(lampuData).forEach(t => timestamps.add(t));

      const filtered = [];
      timestamps.forEach(t => {
        if (t >= startStr) {
          filtered.push({
            timestamp: t,
            suhu: suhuData[t]?.value ?? null,
            cahaya: cahayaData[t]?.value ?? null,
            lampState: lampuData[t]?.state ?? null
          });
        }
      });

      filtered.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      if (filtered.length === 0) {
        if (status) status.textContent = '⚠️ Tidak ada data untuk periode ini.';
        return;
      }

      const periodLabel = period === 'week' ? '1 Minggu Terakhir' : '1 Bulan Terakhir';
      const exportDate = new Date().toLocaleString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      let csv = '';
      csv += `"LAPORAN DATA SENSOR GREENHOUSE"\n`;
      csv += `"${'='.repeat(50)}"\n`;
      csv += `"Tanggal Export","${exportDate}"\n`;
      csv += `"Periode","${periodLabel}"\n`;
      csv += `"Total Data","${filtered.length}"\n`;
      csv += `"Sumber","IoT Greenhouse - Tugas Akhir"\n`;
      csv += `"${'='.repeat(50)}"\n`;
      csv += `\n`;

      csv += `"No","Timestamp","Suhu (°C)","Cahaya (%)","Status Lampu"\n`;

      filtered.forEach((row, index) => {
        const date = new Date(row.timestamp.replace('T', ' ').replace(/-/g, '/'));
        const formattedTime = date.toLocaleString('id-ID', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        const suhu = row.suhu !== null ? row.suhu.toFixed(1) : '';
        const cahaya = row.cahaya !== null ? row.cahaya : '';
        const lampu = row.lampState === true ? 'ON' : (row.lampState === false ? 'OFF' : '');

        csv += `"${index + 1}","${formattedTime}","${suhu}","${cahaya}","${lampu}"\n`;
      });

      csv += `\n`;
      csv += `"${'='.repeat(50)}"\n`;
      csv += `"--- AKHIR LAPORAN ---"\n`;
      csv += `"Export oleh","${currentUser?.nama || 'User'}"\n`;
      csv += `"Waktu Export","${new Date().toLocaleString('id-ID')}"\n`;

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan_sensor_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (status) {
        status.textContent = `✅ Berhasil ekspor ${filtered.length} data!`;
        status.style.color = '#22c55e';
      }

    } catch (error) {
      console.error('Export error:', error);
      if (exportStatus) {
        exportStatus.textContent = '❌ Gagal ekspor data. Cek console.';
        exportStatus.style.color = '#ef4444';
      }
    }
  }

  if (exportBtn && exportPeriod) { exportBtn.addEventListener('click', () => { const period = exportPeriod.value;
      exportData(period); }); }

  /* ========================================
     EXPORT PDF
  ======================================== */
  async function exportPDF() {
    const status = exportStatus;
    if (status) status.textContent = '⏳ Membuat PDF...';

    try {
      if (typeof window.jspdf === 'undefined') {
        alert('❌ Library PDF tidak ditemukan. Pastikan file jsPDF sudah di-load.');
        if (status) status.textContent = '❌ Library PDF tidak ditemukan.';
        return;
      }

      const tempCanvas = document.getElementById('tempChart');
      const lightCanvas = document.getElementById('lightChart');

      if (!tempCanvas || !lightCanvas) {
        alert('Grafik tidak ditemukan!');
        if (status) status.textContent = '❌ Grafik tidak ditemukan.';
        return;
      }

      const tempImg = tempCanvas.toDataURL('image/png');
      const lightImg = lightCanvas.toDataURL('image/png');

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      doc.setFontSize(16);
      doc.text('📊 LAPORAN SENSOR GREENHOUSE', pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`📅 Tanggal: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth / 2, 28, { align: 'center' });

      const imgWidth = (pageWidth - 20) / 2 - 4;
      const imgHeight = imgWidth * 0.6;

      doc.addImage(tempImg, 'PNG', 8, 35, imgWidth, imgHeight);
      doc.setFontSize(11);
      doc.text('🌡️ Suhu Realtime', 8 + imgWidth / 2, 35 + imgHeight + 5, { align: 'center' });

      doc.addImage(lightImg, 'PNG', 8 + imgWidth + 8, 35, imgWidth, imgHeight);
      doc.text('💡 Intensitas Cahaya', 8 + imgWidth + 8 + imgWidth / 2, 35 + imgHeight + 5, { align: 'center' });

      const now = new Date();
      doc.setFontSize(9);
      doc.text(`🔄 Data terakhir: ${now.toLocaleString('id-ID')}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
      doc.text('Sistem IoT Greenhouse - Tugas Akhir', pageWidth / 2, pageHeight - 4, { align: 'center' });

      const filename = `laporan_grafik_${now.toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);

      if (status) {
        status.textContent = `✅ PDF berhasil diunduh! (${filename})`;
        status.style.color = '#22c55e';
      }
    } catch (error) {
      console.error('PDF export error:', error);
      if (status) {
        status.textContent = '❌ Gagal ekspor PDF: ' + error.message;
        status.style.color = '#ef4444';
      }
      alert('❌ Gagal ekspor PDF. Pastikan grafik sudah dimuat.');
    }
  }

  if (exportPdfBtn) { exportPdfBtn.addEventListener('click', exportPDF); }

  /* ========================================
     ADMIN PANEL
  ======================================== */
  function loadUserList() {
    if (!userList) return;
    const userListRef = ref(db, 'users');
    onValue(userListRef, (snapshot) => {
      const users = snapshot.val();
      if (!users) { userList.innerHTML = '<p style="color:var(--muted); text-align:center; padding:20px;">Belum ada user terdaftar.</p>';
        return; }
      let html = `<table style="width:100%; text-align:left; border-collapse:collapse; font-size:14px;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,.1);">
            <th style="padding:8px 4px;">Username</th>
            <th style="padding:8px 4px;">Nama</th>
            <th style="padding:8px 4px;">Role</th>
            <th style="padding:8px 4px;">Aksi</th>
          </tr>
        </thead>
        <tbody>`;
      for (const [username, data] of Object.entries(users)) {
        const isCurrent = (username === currentUser.username);
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,.05);">
          <td style="padding:8px 4px;">${username}${isCurrent ? ' 👑' : ''}</td>
          <td style="padding:8px 4px;">${data.nama || '-'}</td>
          <td style="padding:8px 4px;"><span style="background:${data.role === 'admin' ? 'rgba(139,92,246,.2)' : 'rgba(34,197,94,.2)'}; padding:2px 10px; border-radius:12px; font-size:12px;">${data.role}</span></td>
          <td style="padding:8px 4px;">
            ${!isCurrent ? `
              <button onclick="window.changeRole('${username}', 'admin')" class="small-btn" style="background:rgba(139,92,246,.2); border:none; color:#a78bfa; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:11px; margin-right:4px;">⬆ Admin</button>
              <button onclick="window.changeRole('${username}', 'petani')" class="small-btn" style="background:rgba(34,197,94,.2); border:none; color:#4ade80; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:11px; margin-right:4px;">⬇ Petani</button>
              <button onclick="window.deleteUser('${username}')" class="small-btn danger" style="background:rgba(239,68,68,.2); border:none; color:#f87171; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:11px;">🗑 Hapus</button>
            ` : '<span style="color:var(--muted); font-size:11px;">(Anda)</span>'}
          </td>
        </tr>`;
      }
      html += '</tbody></table>';
      userList.innerHTML = html;
    });
  }

  window.changeRole = function(username, newRole) {
    if (currentUser.role !== 'admin') { alert('❌ Hanya admin yang bisa mengubah role!');
      return; }
    if (!confirm(`Ubah role ${username} menjadi ${newRole}?`)) return;
    update(ref(db, `users/${username}`), { role: newRole }).then(() => { if (addUserMsg) { addUserMsg.textContent = '✅ Role berhasil diubah!';
        addUserMsg.style.color = '#22c55e'; } }).catch(err => { console.error(err);
      if (addUserMsg) { addUserMsg.textContent = '❌ Gagal mengubah role.';
        addUserMsg.style.color = '#ef4444'; } });
  };

  window.deleteUser = function(username) {
    if (currentUser.role !== 'admin') { alert('❌ Hanya admin yang bisa menghapus user!');
      return; }
    if (!confirm(`Hapus user ${username}?`)) return;
    set(ref(db, `users/${username}`), null).then(() => { if (addUserMsg) { addUserMsg.textContent = '✅ User berhasil dihapus!';
        addUserMsg.style.color = '#22c55e'; } }).catch(err => { console.error(err);
      if (addUserMsg) { addUserMsg.textContent = '❌ Gagal menghapus user.';
        addUserMsg.style.color = '#ef4444'; } });
  };

  if (addUserForm) {
    addUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (currentUser.role !== 'admin') { alert('❌ Hanya admin yang bisa menambah user!');
        return; }
      const username = document.getElementById('newUsername').value.trim();
      const password = document.getElementById('newPassword').value.trim();
      const nama = document.getElementById('newNama').value.trim() || username;
      const role = document.getElementById('newRole').value;
      if (!username || !password) { if (addUserMsg) { addUserMsg.textContent = '❌ Username dan password wajib diisi!';
          addUserMsg.style.color = '#ef4444'; }
        return; }
      if (username.length < 3) { if (addUserMsg) { addUserMsg.textContent = '❌ Username minimal 3 karakter!';
          addUserMsg.style.color = '#ef4444'; }
        return; }
      if (password.length < 4) { if (addUserMsg) { addUserMsg.textContent = '❌ Password minimal 4 karakter!';
          addUserMsg.style.color = '#ef4444'; }
        return; }
      const userRef = ref(db, `users/${username}`);
      try {
        const snapshot = await get(userRef);
        if (snapshot.exists()) { if (addUserMsg) { addUserMsg.textContent = '❌ Username sudah terdaftar!';
            addUserMsg.style.color = '#ef4444'; }
          return; }
        await set(userRef, { password: password, nama: nama, role: role, createdAt: new Date().toISOString() });
        if (addUserMsg) { addUserMsg.textContent = '✅ User berhasil ditambahkan!';
          addUserMsg.style.color = '#22c55e'; }
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newNama').value = '';
        document.getElementById('newRole').value = 'petani';
      } catch (err) { console.error(err);
        if (addUserMsg) { addUserMsg.textContent = '❌ Gagal menambahkan user: ' + err.message;
          addUserMsg.style.color = '#ef4444'; } }
    });
  }

  /* ========================================
     FIREBASE REALTIME
  ======================================== */
  const sensorRef = ref(db, 'sensor');
  onValue(sensorRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      state.temperature = data.suhu || 0;
      // Normalisasi cahaya ke persentase (asumsi max 5000 lux)
      const rawCahaya = data.cahaya || 0;
      state.sensorLight = Math.min(100, Math.round(rawCahaya / 5000 * 100));
      const time = new Date().toLocaleTimeString();

      // Update Temp Chart (Analytics)
      if (tempChart) {
        tempLabels.push(time);
        tempData.push(state.temperature);
        if (tempLabels.length > MAX_DATA_POINTS) {
          tempLabels.shift();
          tempData.shift();
        }
        tempChart.update();
      }

      // Update Light Chart (Analytics) – NORMALISASI
      if (lightChart) {
        lightLabels.push(time);
        sensorData.push(state.sensorLight);
        if (lightLabels.length > MAX_DATA_POINTS) {
          lightLabels.shift();
          sensorData.shift();
        }
        lightChart.update();
      }

      // Update Lamp Status Chart – PASTIKAN 0/1
      if (lampStatusChart) {
        lampStatusChart.data.labels.push(time);
        lampStatusChart.data.datasets[0].data.push(state.lampState ? 1 : 0);
        if (lampStatusChart.data.labels.length > MAX_DATA_POINTS) {
          lampStatusChart.data.labels.shift();
          lampStatusChart.data.datasets[0].data.shift();
        }
        lampStatusChart.update();
      }

      // UPDATE DASHBOARD MINI CHART
      if (dashTempChart) {
        dashTempLabels.push(time);
        dashTempData.push(state.temperature);
        if (dashTempLabels.length > 15) {
          dashTempLabels.shift();
          dashTempData.shift();
        }
        dashTempChart.update();
      }
    }
    renderUI();
  }, (error) => { console.error("❌ Sensor error:", error); });

  const controlRef = ref(db, 'control');
  onValue(controlRef, (snapshot) => {
    const data = snapshot.val();
    if (data && data.lamp) {
      state.lampState = data.lamp.state || false;
      state.mode = data.lamp.mode || 'manual';
      if (lampStatusChart && lampStatusChart.data.labels.length > 0) {
        const lastIndex = lampStatusChart.data.labels.length - 1;
        lampStatusChart.data.datasets[0].data[lastIndex] = state.lampState ? 1 : 0;
        lampStatusChart.update();
      }
    }
    renderUI();
    updateModeUI();
  }, (error) => { console.error("❌ Control error:", error); });

  const systemRef = ref(db, 'system');
  onValue(systemRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      state.plantStartDate = data.plant_start_date || null;
      state.alert = data.alert || '';
    }
    updateOverheat();
    updateModeUI();
  }, (error) => { console.error("❌ System error:", error); });

  /* ========================================
     ANALYTICS – FITUR TAMBAHAN
  ======================================== */
  function updateStats(data) {
    if (!data || data.length === 0) return;
    const suhuValues = data.map(d => d.suhu).filter(v => v !== null && !isNaN(v));
    const cahayaValues = data.map(d => d.cahaya).filter(v => v !== null && !isNaN(v));
    if (suhuValues.length === 0) return;
    const avgTemp = suhuValues.reduce((a, b) => a + b, 0) / suhuValues.length;
    const maxTemp = Math.max(...suhuValues);
    const minTemp = Math.min(...suhuValues);
    const avgLight = cahayaValues.length > 0 ? cahayaValues.reduce((a, b) => a + b, 0) / cahayaValues.length : 0;
    document.getElementById('avgTemp').textContent = avgTemp.toFixed(1) + '°C';
    document.getElementById('maxTemp').textContent = maxTemp.toFixed(1) + '°C';
    document.getElementById('minTemp').textContent = minTemp.toFixed(1) + '°C';
    document.getElementById('avgLight').textContent = avgLight.toFixed(1) + '%';
  }

  function updateCategories(data) {
    if (!data || data.length === 0) return;
    let cold = 0,
      normal = 0,
      warm = 0,
      hot = 0;
    data.forEach(d => {
      const temp = d.suhu;
      if (temp < 20) cold++;
      else if (temp >= 20 && temp < 25) normal++;
      else if (temp >= 25 && temp < 30) warm++;
      else hot++;
    });
    const total = data.length;
    const coldPct = (cold / total * 100).toFixed(0);
    const normalPct = (normal / total * 100).toFixed(0);
    const warmPct = (warm / total * 100).toFixed(0);
    const hotPct = (hot / total * 100).toFixed(0);
    document.getElementById('coldBar').style.width = coldPct + '%';
    document.getElementById('coldPercent').textContent = coldPct + '%';
    document.getElementById('normalBar').style.width = normalPct + '%';
    document.getElementById('normalPercent').textContent = normalPct + '%';
    document.getElementById('warmBar').style.width = warmPct + '%';
    document.getElementById('warmPercent').textContent = warmPct + '%';
    document.getElementById('hotBar').style.width = hotPct + '%';
    document.getElementById('hotPercent').textContent = hotPct + '%';
  }

  function updateLampTime(data) {
    if (!data || data.length < 2) {
      document.getElementById('lampOnTime').textContent = 'Belum ada data';
      document.getElementById('lampOffTime').textContent = 'Belum ada data';
      document.getElementById('lampOnBar').style.width = '50%';
      document.getElementById('lampOffBar').style.width = '50%';
      document.getElementById('onPercent').textContent = 'ON: 0%';
      document.getElementById('offPercent').textContent = 'OFF: 0%';
      return;
    }
    let onSeconds = 0;
    let validData = 0;
    for (let i = 1; i < data.length; i++) {
      const d1 = new Date(data[i].timestamp);
      const d0 = new Date(data[i - 1].timestamp);
      if (!isNaN(d1.getTime()) && !isNaN(d0.getTime())) {
        validData++;
        if (data[i].lampState) {
          onSeconds += (d1 - d0) / 1000;
        }
      }
    }
    if (validData === 0) {
      document.getElementById('lampOnTime').textContent = 'Belum ada data';
      document.getElementById('lampOffTime').textContent = 'Belum ada data';
      document.getElementById('lampOnBar').style.width = '50%';
      document.getElementById('lampOffBar').style.width = '50%';
      document.getElementById('onPercent').textContent = 'ON: 0%';
      document.getElementById('offPercent').textContent = 'OFF: 0%';
      return;
    }
    const totalSeconds = validData * 30;
    const offSeconds = totalSeconds - onSeconds;
    const onHours = Math.floor(onSeconds / 3600);
    const onMinutes = Math.floor((onSeconds % 3600) / 60);
    const offHours = Math.floor(offSeconds / 3600);
    const offMinutes = Math.floor((offSeconds % 3600) / 60);
    document.getElementById('lampOnTime').textContent = onHours + ' jam ' + onMinutes + ' menit';
    document.getElementById('lampOffTime').textContent = offHours + ' jam ' + offMinutes + ' menit';
    const onPct = (onSeconds / totalSeconds * 100).toFixed(1);
    const offPct = (offSeconds / totalSeconds * 100).toFixed(1);
    document.getElementById('lampOnBar').style.width = onPct + '%';
    document.getElementById('lampOffBar').style.width = offPct + '%';
    document.getElementById('onPercent').textContent = 'ON: ' + onPct + '%';
    document.getElementById('offPercent').textContent = 'OFF: ' + offPct + '%';
  }

  async function updateTrend() {
    const suhuRef = ref(db, 'sensor_history/suhu');
    const snapshot = await get(query(suhuRef, orderByKey(), limitToLast(7)));
    const data = snapshot.val();
    if (!data) return;
    const keys = Object.keys(data).sort();
    const container = document.getElementById('trendContainer');
    container.innerHTML = '';
    const dayMap = {};
    keys.forEach(key => { const day = key.split('T')[0];
      dayMap[day] = data[key].value; });
    const days = Object.keys(dayMap);
    let prevTemp = null;
    days.forEach((day, index) => {
      const temp = dayMap[day];
      const div = document.createElement('div');
      div.style.cssText = 'text-align:center; padding:8px; background:rgba(255,255,255,.04); border-radius:8px;';
      const date = new Date(day + 'T00:00:00');
      const label = date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
      let arrow = '',
        arrowColor = '';
      if (prevTemp !== null) { if (temp > prevTemp) { arrow = '▲';
          arrowColor = '#22c55e'; } else if (temp < prevTemp) { arrow = '▼';
          arrowColor = '#ef4444'; } else { arrow = '•';
          arrowColor = '#94a3b8'; } }
      prevTemp = temp;
      div.innerHTML = `
        <div style="font-size:11px; color:var(--muted);">${label}</div>
        <div style="font-size:18px; font-weight:700;">${temp.toFixed(1)}°C</div>
        <div style="font-size:12px; color:${arrowColor};">${arrow}</div>
      `;
      container.appendChild(div);
    });
  }

  async function updateHeatmap() {
    const suhuRef = ref(db, 'sensor_history/suhu');
    const snapshot = await get(query(suhuRef, orderByKey(), limitToLast(168)));
    const data = snapshot.val();
    if (!data) return;
    const keys = Object.keys(data).sort();
    const last7Days = keys.slice(-168);
    const hourMap = {};
    last7Days.forEach(key => {
      const date = new Date(key.replace('T', ' ').replace(/-/g, '/'));
      const hour = date.getHours();
      const day = key.split('T')[0];
      if (!hourMap[day]) hourMap[day] = {};
      hourMap[day][hour] = data[key].value;
    });
    const days = Object.keys(hourMap).sort();
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const table = document.getElementById('heatmapTable');
    let html = '<thead><tr><th style="padding:4px;">Jam</th>';
    days.forEach(day => {
      const date = new Date(day + 'T00:00:00');
      html += `<th style="padding:4px; font-size:10px;">${date.toLocaleDateString('id-ID', { weekday: 'short' })}</th>`;
    });
    html += '</tr></thead><tbody>';
    hours.forEach(hour => {
      html += `<tr><td style="padding:4px; font-size:10px; color:var(--muted);">${hour}:00</td>`;
      days.forEach(day => {
        const temp = hourMap[day]?.[hour];
        let color = '#1e293b';
        let text = '-';
        if (temp !== undefined) {
          text = temp.toFixed(1);
          if (temp < 20) color = '#3b82f6';
          else if (temp < 25) color = '#22c55e';
          else if (temp < 30) color = '#f59e0b';
          else color = '#ef4444';
        }
        html += `<td style="padding:4px; text-align:center; background:${color}; border-radius:4px; font-size:10px; color:white;">${text}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
  }

  function updateHistogram(data) {
    if (!data || data.length === 0) return;
    const suhuValues = data.map(d => d.suhu).filter(v => v !== null && !isNaN(v));
    if (suhuValues.length === 0) return;
    const bins = [18, 20, 22, 24, 26, 28, 30, 32, 34];
    const counts = new Array(bins.length - 1).fill(0);
    const labels = [];
    for (let i = 0; i < bins.length - 1; i++) {
      labels.push(bins[i] + '-' + bins[i + 1] + '°C');
      suhuValues.forEach(v => { if (v >= bins[i] && v < bins[i + 1]) counts[i]++; });
    }
    const ctx = document.getElementById('histogramChart')?.getContext('2d');
    if (!ctx) return;
    if (window.histogramChartInstance) { window.histogramChartInstance.destroy(); }
    window.histogramChartInstance = new Chart(ctx, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Frekuensi', data: counts, backgroundColor: 'rgba(34,197,94,0.5)', borderColor: '#22c55e', borderWidth: 1, borderRadius: 4 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return context.parsed.y + ' data'; } } } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
        }
      }
    });
  }

  async function loadAllAnalytics() {
    try {
      const suhuRef = ref(db, 'sensor_history/suhu');
      const snapshot = await get(query(suhuRef, orderByKey(), limitToLast(500)));
      const rawData = snapshot.val();
      if (!rawData) return;
      const keys = Object.keys(rawData).sort();
      const data = keys.map(key => ({ timestamp: key, suhu: rawData[key]?.value || 0, cahaya: 0, lampState: false }));
      const cahayaRef = ref(db, 'sensor_history/cahaya');
      const cahayaSnap = await get(query(cahayaRef, orderByKey(), limitToLast(500)));
      const cahayaData = cahayaSnap.val() || {};
      const lampuRef = ref(db, 'sensor_history/lampu');
      const lampuSnap = await get(query(lampuRef, orderByKey(), limitToLast(500)));
      const lampuData = lampuSnap.val() || {};
      data.forEach(d => {
        const rawCahaya = cahayaData[d.timestamp]?.value || 0;
        d.cahaya = Math.min(100, Math.round(rawCahaya / 5000 * 100));
        d.lampState = lampuData[d.timestamp]?.state || false;
      });
      updateStats(data);
      updateCategories(data);
      updateLampTime(data);
      updateHistogram(data);
    } catch (e) { console.warn('Analytics load error:', e); }
  }

  /* ========================================
     EXPAND CHART TOGGLE
  ======================================== */
  function toggleExpand(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    const isExpanded = wrapper.classList.contains('expanded');

    // Tutup semua yang lain
    document.querySelectorAll('.chart-wrapper.expanded').forEach(el => {
      if (el.id !== wrapperId) {
        el.classList.remove('expanded');
      }
    });

    if (isExpanded) {
      wrapper.classList.remove('expanded');
    } else {
      wrapper.classList.add('expanded');
      setTimeout(() => {
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }

    const canvas = wrapper.querySelector('canvas');
    if (canvas) {
      const chart = Chart.getChart(canvas);
      if (chart) chart.resize();
    }
  }

  window.toggleExpand = toggleExpand;

  /* ========================================
     TOAST NOTIFICATION
  ======================================== */
  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
      background: #1e293b; color: white; padding: 16px 24px;
      border-radius: 16px; font-weight: 600; z-index: 9999;
      box-shadow: 0 8px 30px rgba(0,0,0,0.6);
      border-left: 4px solid #facc15;
      max-width: 90%;
      text-align: center;
      animation: slideUp 0.4s ease;
      font-size: 15px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.5s';
      setTimeout(() => toast.remove(), 500); }, 5000);
  }

  /* ========================================
     CONTROLS
  ======================================== */
  if (btnOn) {
    btnOn.addEventListener("click", () => { set(ref(db, "control/lamp/state"), true).then(() => { state.lampState = true;
        renderUI(); }).catch(err => console.error("Set state error:", err)); });
  }
  if (btnOff) {
    btnOff.addEventListener("click", () => { set(ref(db, "control/lamp/state"), false).then(() => { state.lampState = false;
        renderUI(); }).catch(err => console.error("Set state error:", err)); });
  }

  /* ========================================
     MOBILE SIDEBAR TOGGLE
  ======================================== */
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  let overlay = document.querySelector(".mobile-overlay");
  if (!overlay) { overlay = document.createElement("div");
    overlay.className = "mobile-overlay";
    document.body.appendChild(overlay); }

  function openMenu() { sidebar.classList.add("active");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden"; }

  function closeMenu() { sidebar.classList.remove("active");
    overlay.classList.remove("active");
    document.body.style.overflow = ""; }

  function toggleMenu() { if (sidebar.classList.contains("active")) { closeMenu(); } else { openMenu(); } }

  if (menuToggle) {
    menuToggle.addEventListener("click", toggleMenu);
    menuToggle.addEventListener("touchstart", (e) => { e.preventDefault();
      toggleMenu(); }, { passive: false });
  }
  overlay.addEventListener("click", closeMenu);
  overlay.addEventListener("touchstart", (e) => { e.preventDefault();
    closeMenu(); }, { passive: false });
  window.addEventListener("resize", () => { if (window.innerWidth > 768) { closeMenu(); } });
  console.log("✅ Mobile sidebar toggle ready!");

  /* ========================================
     SIDEBAR NAVIGATION
  ======================================== */
  console.log("🔧 INIT: Simple Navigation");
  const menuItems = document.querySelectorAll(".menu-item");
  const sections = document.querySelectorAll(".page-section");
  menuItems.forEach((item) => {
    item.addEventListener("click", function(e) {
      e.preventDefault();
      console.log("🖱️ KLIK:", this.textContent.trim());
      menuItems.forEach(m => m.classList.remove("active"));
      this.classList.add("active");
      const target = this.getAttribute("data-target");
      console.log("🎯 Target:", target);
      sections.forEach(s => s.classList.add("hidden"));
      const targetSection = document.getElementById(target);
      if (targetSection) { targetSection.classList.remove("hidden");
        console.log("✅ Berhasil ke:", target); } else { console.error("❌ GAGAL! Section", target, "tidak ditemukan!"); }
      const sidebarEl = document.querySelector(".sidebar");
      if (sidebarEl && window.innerWidth <= 768) { sidebarEl.classList.remove("active");
        document.querySelector(".mobile-overlay")?.classList.remove("active"); }
    });
  });
  const defaultSection = document.getElementById("dashboard");
  if (defaultSection) { sections.forEach(s => s.classList.add("hidden"));
    defaultSection.classList.remove("hidden");
    console.log("✅ Dashboard aktif"); }
  console.log("✅ Navigation ready!");

  /* ========================================
     CLOCK
  ======================================== */
  function updateClock() {
    const now = new Date();
    const dateText = document.getElementById("dateText");
    const clockText = document.getElementById("clockText");
    if (dateText) { dateText.innerText = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    if (clockText) { clockText.innerText = now.toLocaleTimeString('id-ID'); }
  }
  updateClock();
  setInterval(updateClock, 1000);

  /* ========================================
     LOAD ADMIN PANEL & ANALYTICS
  ======================================== */
  if (currentUser && currentUser.role === 'admin') { loadUserList(); }

  loadChartHistory();
  loadAllAnalytics();
  updateModeUI();

  console.log("🚀 App siap!");

});
