// ============================================
// ANALYTICS: Charts, Export, Statistik (FINAL SAFE)
// ============================================

import { db } from '../firebase.js';
import { ref, get, query, orderByKey, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { state, DOM, showToast, formatTime } from './core.js';
import { getDays } from './ui.js';

// ---- CHART VARIABLES ----
const MAX_POINTS = 288; // titik mentah maksimal diambil per path
export const tempLabels = [], tempData = [], lightLabels = [], sensorData = [];
export let tempChart = null, lightChart = null, lampStatusChart = null;
const dashTempLabels = [], dashTempData = [];
let dashTempChart = null;

// ---- CACHE ----
const CACHE_KEY = 'analytics_24h_cache';
const CACHE_DURATION = 30 * 60 * 1000; // 30 menit

// ---- INIT CHARTS (TIDAK BERUBAH) ----
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

// ---- UPDATE CHARTS REAL-TIME (TIDAK BERUBAH) ----
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
// LOAD HISTORY (FIXED - SEMUA QUERY DIBATASI)
// ============================================
export async function loadChartHistory() {
  // Cek cache
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp < CACHE_DURATION) {
      console.log('📦 Gunakan cache history (30 menit)');
      applyChartData(parsed.data);
      return;
    }
  }

  try {
    // 1. Ambil 288 data terakhir dari masing-masing path (PARALEL + BATAS)
    const [suhuSnap, cahayaSnap, lampuSnap] = await Promise.all([
      get(query(ref(db, 'sensor_history/suhu'), orderByKey(), limitToLast(MAX_POINTS))),
      get(query(ref(db, 'sensor_history/cahaya'), orderByKey(), limitToLast(MAX_POINTS))),
      get(query(ref(db, 'sensor_history/lampu'), orderByKey(), limitToLast(MAX_POINTS)))
    ]);

    const suhuData = suhuSnap.val() || {};
    const cahayaData = cahayaSnap.val() || {};
    const lampuData = lampuSnap.val() || {};

    // 2. Ambil semua key dari suhu (sebagai indeks utama)
    const allKeys = Object.keys(suhuData).sort();
    if (allKeys.length === 0) {
      console.warn('⚠️ Tidak ada data history.');
      return;
    }

    // 3. Gabungkan data
    const rawData = allKeys.map(key => ({
      key,
      suhu: suhuData[key]?.value || 0,
      cahaya: cahayaData[key]?.value || 0,
      lampu: lampuData[key]?.state ? 1 : 0,
      timestamp: keyToTimestamp(key)
    }));

    // 4. Filter 24 jam terakhir
    const now = Date.now();
    const oneDayAgo = now - 86400000;
    const recentData = rawData.filter(d => d.timestamp >= oneDayAgo);

    // 5. Reduksi ke 24 titik (1 per jam)
    const hourlyData = reduceToHourly(recentData, 24);

    // 6. Cache
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: hourlyData
    }));

    // 7. Render
    applyChartData(hourlyData);
    console.log('✅ History loaded, titik:', hourlyData.length);

  } catch (e) {
    console.error('❌ Gagal load history:', e);
  }
}

// ---- KONVERSI KEY "YYYY-MM-DDTHH-MM-SS" KE UNIX TIMESTAMP (ms) ----
function keyToTimestamp(key) {
  const parts = key.replace('T', ' ').split(' ');
  const dateParts = parts[0].split('-');
  const timeParts = parts[1].split('-');
  return new Date(
    parseInt(dateParts[0]),
    parseInt(dateParts[1]) - 1,
    parseInt(dateParts[2]),
    parseInt(timeParts[0]),
    parseInt(timeParts[1]),
    parseInt(timeParts[2])
  ).getTime();
}

// ---- REDUKSI KE 1 TITIK PER JAM ----
function reduceToHourly(data, totalPoints) {
  if (data.length === 0) return [];
  data.sort((a, b) => a.timestamp - b.timestamp);
  const start = data[0].timestamp;
  const end = data[data.length - 1].timestamp;
  const interval = (end - start) / (totalPoints - 1 || 1);
  const result = [];
  for (let i = 0; i < totalPoints; i++) {
    const target = start + i * interval;
    let closest = data[0];
    let minDiff = Math.abs(data[0].timestamp - target);
    for (const point of data) {
      const diff = Math.abs(point.timestamp - target);
      if (diff < minDiff) { minDiff = diff; closest = point; }
    }
    result.push(closest);
  }
  return result;
}

// ---- APPLY DATA KE CHART & STATS ----
function applyChartData(hourlyData) {
  tempLabels.length = 0; tempData.length = 0;
  lightLabels.length = 0; sensorData.length = 0;
  if (lampStatusChart) {
    lampStatusChart.data.labels = [];
    lampStatusChart.data.datasets[0].data = [];
  }
  
  const labels = hourlyData.map(d => {
    const date = new Date(d.timestamp);
    return String(date.getHours()).padStart(2,'0') + ':00';
  });
  
  hourlyData.forEach((d, i) => {
    tempLabels.push(labels[i]);
    tempData.push(d.suhu);
    lightLabels.push(labels[i]);
    sensorData.push(Math.min(100, Math.round(d.cahaya / 5000 * 100)));
    if (lampStatusChart) {
      lampStatusChart.data.labels.push(labels[i]);
      lampStatusChart.data.datasets[0].data.push(d.lampu);
    }
  });
  
  if (tempChart) tempChart.update();
  if (lightChart) lightChart.update();
  if (lampStatusChart) lampStatusChart.update();
  
  // Statistik
  updateStats(hourlyData);
  updateCategoryStats(hourlyData);
  updateLampStats(hourlyData);
  updateTrend(hourlyData);
  updateHeatmap(hourlyData);
  updateHistogram(hourlyData);
}

// ---- STATISTIK (FUNGSI SAMA SEPERTI SEBELUMNYA, TETAPI DATA MASUKAN BERUBAH) ----
// ... (semua fungsi updateStats, updateCategoryStats, dll. tetap sama seperti sebelumnya,
//      tetapi menerima hourlyData yang sudah berupa array objek {suhu, cahaya, lampu, timestamp})
//      Saya tulis ulang sekilas di bawah agar tidak bingung)

function updateStats(data) {
  const temps = data.map(d => d.suhu).filter(v => v > 0);
  if (temps.length) {
    const avg = temps.reduce((a,b)=>a+b,0)/temps.length;
    document.getElementById('avgTemp').textContent = avg.toFixed(1) + '°C';
    document.getElementById('maxTemp').textContent = Math.max(...temps).toFixed(1) + '°C';
    document.getElementById('minTemp').textContent = Math.min(...temps).toFixed(1) + '°C';
  }
  const lights = data.map(d => d.cahaya).filter(v => v > 0);
  if (lights.length) {
    const avgL = lights.reduce((a,b)=>a+b,0)/lights.length;
    document.getElementById('avgLight').textContent = Math.min(100, Math.round(avgL/5000*100)) + '%';
  }
}

function updateCategoryStats(data) {
  const values = data.map(d => d.suhu).filter(v => v > 0);
  if (!values.length) {
    ['cold','normal','warm','hot'].forEach(id => {
      document.getElementById(id+'Percent').textContent = '0%';
      document.getElementById(id+'Bar').style.width = '0%';
    });
    return;
  }
  const total = values.length;
  const calc = n => Math.round((n/total)*100);
  const cold = values.filter(v => v < 25).length;
  const normal = values.filter(v => v >= 25 && v < 30).length;
  const warm = values.filter(v => v >= 30 && v < 34).length;
  const hot = values.filter(v => v >= 34).length;
  document.getElementById('coldPercent').textContent = calc(cold)+'%';
  document.getElementById('normalPercent').textContent = calc(normal)+'%';
  document.getElementById('warmPercent').textContent = calc(warm)+'%';
  document.getElementById('hotPercent').textContent = calc(hot)+'%';
  document.getElementById('coldBar').style.width = calc(cold)+'%';
  document.getElementById('normalBar').style.width = calc(normal)+'%';
  document.getElementById('warmBar').style.width = calc(warm)+'%';
  document.getElementById('hotBar').style.width = calc(hot)+'%';
}

function updateLampStats(data) {
  const total = data.length;
  if (!total) return;
  const on = data.filter(d => d.lampu === 1).length;
  const off = total - on;
  const onP = Math.round((on/total)*100);
  const offP = 100 - onP;
  document.getElementById('lampOnTime').textContent = `${on} jam`;
  document.getElementById('lampOffTime').textContent = `${off} jam`;
  document.getElementById('onPercent').textContent = `ON: ${onP}%`;
  document.getElementById('offPercent').textContent = `OFF: ${offP}%`;
  document.getElementById('lampOnBar').style.width = onP+'%';
  document.getElementById('lampOffBar').style.width = offP+'%';
}

function updateTrend(data) {
  const container = document.getElementById('trendContainer');
  if (!container) return;
  const days = {};
  data.forEach(d => {
    const day = new Date(d.timestamp).toISOString().slice(0,10);
    if (!days[day]) days[day] = [];
    days[day].push(d.suhu);
  });
  const now = new Date();
  let html = '';
  for (let i=6; i>=0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate()-i);
    const key = d.toISOString().slice(0,10);
    const vals = days[key] || [];
    const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : '--';
    const color = avg > 30 ? '#ef4444' : avg > 25 ? '#f59e0b' : avg > 20 ? '#22c55e' : '#3b82f6';
    html += `<div style="text-align:center;background:rgba(255,255,255,.04);padding:8px;border-radius:8px;">
      <div style="font-size:11px;color:var(--muted);">${key.slice(5)}</div>
      <div style="font-size:16px;font-weight:600;color:${color};">${avg}°</div>
    </div>`;
  }
  container.innerHTML = html;
}

function updateHeatmap(data) {
  const table = document.getElementById('heatmapTable');
  if (!table) return;
  const now = new Date();
  const days = [];
  for (let i=6; i>=0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate()-i);
    days.push(d.toISOString().slice(0,10));
  }
  const ranges = [0,6,12,18,24];
  let html = '<thead><tr><th></th>';
  for (let i=0; i<4; i++) html += `<th style="font-size:10px;color:var(--muted);">${ranges[i]}-${ranges[i+1]}</th>`;
  html += '</tr></thead><tbody>';
  days.forEach(day => {
    html += `<tr><td style="font-size:11px;color:var(--muted);">${day.slice(5)}</td>`;
    for (let i=0; i<4; i++) {
      const vals = data.filter(d => {
        const dt = new Date(d.timestamp);
        return dt.toISOString().slice(0,10) === day && dt.getHours() >= ranges[i] && dt.getHours() < ranges[i+1];
      }).map(d => d.suhu).filter(v=>v>0);
      const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : '-';
      let bg = 'rgba(100,116,139,0.2)', tc = '#94a3b8';
      if (avg !== '-') {
        if (avg > 30) { bg = 'rgba(239,68,68,0.4)'; tc = '#ef4444'; }
        else if (avg > 25) { bg = 'rgba(245,158,11,0.4)'; tc = '#f59e0b'; }
        else if (avg > 20) { bg = 'rgba(34,197,94,0.4)'; tc = '#22c55e'; }
        else { bg = 'rgba(59,130,246,0.4)'; tc = '#3b82f6'; }
      }
      html += `<td style="background:${bg};text-align:center;padding:6px;border-radius:4px;font-size:12px;color:${tc};">${avg}</td>`;
    }
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
}

function updateHistogram(data) {
  const canvas = document.getElementById('histogramChart');
  if (!canvas) return;
  const values = data.map(d => d.suhu).filter(v => v > 0);
  let chart = Chart.getChart(canvas);
  if (chart) chart.destroy();
  if (!values.length) {
    new Chart(canvas, {
      type: 'bar',
      data: { labels: ['0-10','10-20','20-30','30-40','40+'], datasets: [{ data: [0,0,0,0,0], backgroundColor: '#64748b' }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
    return;
  }
  const bins = [0,10,20,25,30,35,40];
  const labels = ['0-10°C','10-20°C','20-25°C','25-30°C','30-35°C','35-40°C','40+°C'];
  const counts = bins.map((b,i) => {
    const next = bins[i+1] || Infinity;
    return values.filter(v => v >= b && v < next).length;
  });
  new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data: counts, backgroundColor: ['#3b82f6','#22c55e','#f59e0b','#f59e0b','#ef4444','#ef4444','#7c3aed'] }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

// ---- EXPORT CSV & PDF TIDAK BERUBAH (GUNAKAN FULL HISTORY, BIAR USER BISA DOWNLOAD SEMUA) ----
// ... (biarkan seperti kode asli)
export async function exportData(period) { /* kode asli */ }
export async function exportPDF() { /* kode asli */ }
