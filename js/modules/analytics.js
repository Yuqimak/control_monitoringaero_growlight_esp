// ============================================
// ANALYTICS: Charts, Export, Statistik (FINAL FIX)
// ============================================

import { db } from '../firebase.js';
import { ref, get, query, orderByKey, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { state, DOM, showToast, formatTime } from './core.js';

// ---- CHART VARIABLES ----
const MAX_POINTS = 288;
export const tempLabels = [], tempData = [], lightLabels = [], sensorData = [];
export let tempChart = null, lightChart = null, lampStatusChart = null;
const dashTempLabels = [], dashTempData = [];
let dashTempChart = null;

// ---- CACHE ----
const CACHE_KEY = 'analytics_24h_cache';
const CACHE_DURATION = 30 * 60 * 1000;

// ---- INIT CHARTS ----
export function initCharts() {
  const opts = {
    responsive: true,
    plugins: { legend: { labels: { color: '#cbd5e1' } } },
    scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } }
  };
  
  const tEl = document.getElementById('tempChart');
  if (tEl) {
    tempChart = new Chart(tEl, {
      type: 'line',
      data: { labels: tempLabels, datasets: [{ label: 'Temperature (°C)', data: tempData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.2)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 }] },
      options: opts
    });
  }
  
  const lEl = document.getElementById('lightChart');
  if (lEl) {
    lightChart = new Chart(lEl, {
      type: 'line',
      data: { labels: lightLabels, datasets: [{ label: 'Sensor Light (%)', data: sensorData, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.2)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 }] },
      options: opts
    });
  }
  
  const lsEl = document.getElementById('lampStatusChart');
  if (lsEl) {
    lampStatusChart = new Chart(lsEl, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Status Lampu', data: [], backgroundColor: (ctx) => ctx.dataset.data[ctx.dataIndex] === 1 ? '#22c55e' : '#ef4444', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderRadius: 4 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.parsed.y === 1 ? 'ON' : 'OFF' } } },
        scales: {
          x: { ticks: { color: '#94a3b8', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#94a3b8', stepSize: 1, callback: (v) => v === 1 ? 'ON' : 'OFF' }, min: -0.5, max: 1.5, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }
  
  const dEl = document.getElementById('dashTempChart');
  if (dEl) {
    dashTempChart = new Chart(dEl, {
      type: 'line',
      data: { labels: dashTempLabels, datasets: [{ label: 'Suhu (°C)', data: dashTempData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
  }
}

// ---- UPDATE CHARTS REAL-TIME ----
export function updateCharts(time) {
  if (tempChart) {
    tempLabels.push(time);
    tempData.push(state.temperature);
    if (tempLabels.length > MAX_POINTS) { tempLabels.shift(); tempData.shift(); }
    tempChart.update();
  }
  
  if (lightChart) {
    lightLabels.push(time);
    sensorData.push(state.sensorLight);
    if (lightLabels.length > MAX_POINTS) { lightLabels.shift(); sensorData.shift(); }
    lightChart.update();
  }
  
  if (lampStatusChart) {
    lampStatusChart.data.labels.push(time);
    lampStatusChart.data.datasets[0].data.push(state.lampState ? 1 : 0);
    if (lampStatusChart.data.labels.length > MAX_POINTS) {
      lampStatusChart.data.labels.shift();
      lampStatusChart.data.datasets[0].data.shift();
    }
    lampStatusChart.update();
  }
  
  if (dashTempChart) {
    dashTempLabels.push(time);
    dashTempData.push(state.temperature);
    if (dashTempLabels.length > 15) { dashTempLabels.shift(); dashTempData.shift(); }
    dashTempChart.update();
  }
}

// ============================================
// LOAD HISTORY
// ============================================
export async function loadChartHistory() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp < CACHE_DURATION) {
      console.log('📦 Gunakan cache history (30 menit)');
      if (parsed.data && parsed.data.length > 0) {
        applyChartData(parsed.data);
        return;
      }
    }
  }

  try {
    const [suhuSnap, cahayaSnap, lampuSnap] = await Promise.all([
      get(query(ref(db, 'sensor_history/suhu'), orderByKey(), limitToLast(MAX_POINTS))),
      get(query(ref(db, 'sensor_history/cahaya'), orderByKey(), limitToLast(MAX_POINTS))),
      get(query(ref(db, 'sensor_history/lampu'), orderByKey(), limitToLast(MAX_POINTS)))
    ]);

    const suhuData = suhuSnap.val() || {};
    const cahayaData = cahayaSnap.val() || {};
    const lampuData = lampuSnap.val() || {};

    const allKeys = Object.keys(suhuData).sort();
    if (allKeys.length === 0) {
      console.warn('⚠️ Tidak ada data history.');
      return;
    }

    const rawData = allKeys.map(key => {
      const suhuEntry = suhuData[key];
      const cahayaEntry = cahayaData[key];
      const lampuEntry = lampuData[key];
      
      let suhu = suhuEntry?.value ?? suhuEntry ?? 0;
      let cahaya = cahayaEntry?.value ?? cahayaEntry ?? 0;
      
      let lampu = 0;
      if (lampuEntry !== undefined && lampuEntry !== null) {
        if (typeof lampuEntry === 'object') {
          const stateVal = lampuEntry.state ?? lampuEntry.value ?? lampuEntry.lampu ?? 0;
          lampu = (stateVal === true || stateVal === 1 || stateVal === 'ON' || stateVal === 'on') ? 1 : 0;
        } else {
          lampu = (lampuEntry === true || lampu
