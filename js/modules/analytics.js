// ============================================
// ANALYTICS: Charts, Export, Statistik (FINAL + LUX BULAT)
// ============================================

import { db } from '../firebase.js';
import { ref, get, query, orderByKey, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { state, DOM, showToast, formatTime } from './core.js';

console.log('📊 analytics.js loaded!');

const MAX_POINTS = 288;
export const tempLabels = [], tempData = [], lightLabels = [], sensorData = [];
export let tempChart = null, lightChart = null, lampStatusChart = null;
const dashTempLabels = [], dashTempData = [];
export let dashTempChart = null;

const CACHE_KEY = 'analytics_24h_cache';
const CACHE_DURATION = 30 * 60 * 1000;

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

const isMobile = window.innerWidth < 768;

function getChartOptions() {
  const isMobile = window.innerWidth < 768;
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        labels: {
          color: '#cbd5e1',
          font: { size: isMobile ? 10 : 12 },
          boxWidth: isMobile ? 10 : 15,
          padding: isMobile ? 5 : 10
        }
      },
      tooltip: {
        bodyFont: { size: isMobile ? 10 : 12 },
        titleFont: { size: isMobile ? 10 : 12 }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#94a3b8',
          maxTicksLimit: isMobile ? 6 : 12,
          font: { size: isMobile ? 8 : 10 }
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      },
      y: {
        ticks: {
          color: '#94a3b8',
          font: { size: isMobile ? 8 : 10 }
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      }
    }
  };
}

export function initCharts() {
  console.log('📊 initCharts dipanggil');
  const isMobile = window.innerWidth < 768;
  const opts = getChartOptions();

  const tEl = document.getElementById('tempChart');
  if (tEl) {
    tempChart = new Chart(tEl, {
      type: 'line',
      data: {
        labels: tempLabels,
        datasets: [{
          label: 'Temperature (°C)',
          data: tempData,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.2)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: isMobile ? 3 : 5,
          pointHoverRadius: isMobile ? 5 : 8,
          pointBackgroundColor: '#22c55e',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: opts
    });
  }

  const lEl = document.getElementById('lightChart');
  if (lEl) {
    lightChart = new Chart(lEl, {
      type: 'line',
      data: {
        labels: lightLabels,
        datasets: [{
          label: 'Sensor Light (lux)',
          data: sensorData,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56,189,248,0.2)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: isMobile ? 3 : 5,
          pointHoverRadius: isMobile ? 5 : 8,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: opts
    });
  }

  const lsEl = document.getElementById('lampStatusChart');
  if (lsEl) {
    lampStatusChart = new Chart(lsEl, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Status Lampu', data: [], backgroundColor: (ctx) => { const value = ctx.dataset.data[ctx.dataIndex]; return value === 1 ? '#22c55e' : '#ef4444'; }, borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderRadius: 4, barPercentage: isMobile ? 0.6 : 0.8 }] },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.parsed.y === 1 ? 'ON' : 'OFF' }, bodyFont: { size: isMobile ? 10 : 12 } } },
        scales: {
          x: { ticks: { color: '#94a3b8', maxTicksLimit: isMobile ? 6 : 10, font: { size: isMobile ? 8 : 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#94a3b8', stepSize: 1, callback: (v) => v === 1 ? 'ON' : 'OFF', font: { size: isMobile ? 8 : 10 } }, min: -0.5, max: 1.5, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  const dEl = document.getElementById('dashTempChart');
  if (dEl) {
    dashTempChart = new Chart(dEl, {
      type: 'line',
      data: { labels: dashTempLabels, datasets: [{ label: 'Suhu (°C)', data: dashTempData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: isMobile ? 2 : 3 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
  }
}

export function updateCharts(time) {
  if (tempChart) {
    tempLabels.push(time);
    tempData.push(state.temperature);
    if (tempLabels.length > MAX_POINTS) { tempLabels.shift();
      tempData.shift(); }
    tempChart.update();
  }
  if (lightChart) {
    lightLabels.push(time);
    sensorData.push(state.sensorLight);
    if (lightLabels.length > MAX_POINTS) { lightLabels.shift();
      sensorData.shift(); }
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
    if (dashTempLabels.length > 15) {
      dashTempLabels.shift();
      dashTempData.shift();
    }
    dashTempChart.update();
  }
}

export async function loadDashChartHistory() {
  console.log('📊 loadDashChartHistory dipanggil');
  try {
    const snapshot = await get(query(ref(db, 'sensor_history/suhu'), orderByKey(), limitToLast(15)));
    const data = snapshot.val();
    if (!data) return;
    const keys = Object.keys(data).sort();
    const labels = [];
    const values = [];
    keys.forEach(key => {
      const entry = data[key];
      const suhu = entry?.value ?? entry ?? 0;
      if (suhu > 0) {
        const date = new Date(parseKeyToTimestamp(key));
        labels.push(String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'));
        values.push(suhu);
      }
    });
    setTimeout(() => {
      if (dashTempChart) {
        dashTempChart.data.labels = labels;
        dashTempChart.data.datasets[0].data = values;
        dashTempChart.update();
        console.log('✅ Dashboard chart diisi');
      } else {
        const chart = Chart.getChart('dashTempChart');
        if (chart) {
          chart.data.labels = labels;
          chart.data.datasets[0].data = values;
          chart.update();
        }
      }
    }, 500);
  } catch (e) { console.error('❌ Gagal load dashboard chart:', e); }
}

export async function loadChartHistory() {
  console.log('📊 loadChartHistory dipanggil');
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp < CACHE_DURATION) {
      console.log('📦 Gunakan cache');
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
    if (allKeys.length === 0) return;

    const rawData = allKeys.map(key => {
      const suhuEntry = suhuData[key];
      const cahayaEntry = cahayaData[key];
      const lampuEntry = lampuData[key];

      let suhu = suhuEntry?.value ?? suhuEntry ?? 0;
      let cahaya = cahayaEntry?.value ?? cahayaEntry ?? 0;

      let lampu = 0;
      if (lampuEntry !== undefined && lampuEntry !== null) {
        if (typeof lampuEntry === 'object') {
          if (lampuEntry.state !== undefined) {
            lampu = (lampuEntry.state === true || lampuEntry.state === 1 || lampuEntry.state === 'ON') ? 1 : 0;
          } else if (lampuEntry.value !== undefined) {
            lampu = (lampuEntry.value === true || lampuEntry.value === 1 || lampuEntry.value === 'ON') ? 1 : 0;
          }
        } else {
          lampu = (lampuEntry === true || lampuEntry === 1 || lampuEntry === 'ON') ? 1 : 0;
        }
      }

      const timestamp = parseKeyToTimestamp(key);
      return { key, suhu: Number(suhu), cahaya: Number(cahaya), lampu, timestamp };
    });

    const validData = rawData.filter(d => d.timestamp > 0);
    if (validData.length === 0) return;

    const now = Date.now();
    const oneDayAgo = now - 86400000;
    const recentData = validData.filter(d => d.timestamp >= oneDayAgo);

    let chartData = recentData.length <= 24 ? recentData : reduceToHourly(recentData, 24);

    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: chartData }));
    applyChartData(chartData);
    console.log('✅ History loaded, titik:', chartData.length);
  } catch (e) { console.error('❌ Gagal load history:', e); }
}

export async function loadChartHistoryByDate(dateStr) {
  console.log('📅 loadChartHistoryByDate:', dateStr);
  try {
    if (!dateStr) { showToast('⚠️ Pilih tanggal dulu!', 'warning'); return; }

    const [suhuSnap, cahayaSnap, lampuSnap] = await Promise.all([
      get(ref(db, 'sensor_history/suhu')),
      get(ref(db, 'sensor_history/cahaya')),
      get(ref(db, 'sensor_history/lampu'))
    ]);

    const suhuData = suhuSnap.val() || {};
    const cahayaData = cahayaSnap.val() || {};
    const lampuData = lampuSnap.val() || {};

    const allKeys = Object.keys(suhuData).sort();
    const filteredKeys = allKeys.filter(key => {
      const ts = parseKeyToTimestamp(key);
      if (ts === 0) return false;
      return new Date(ts).toISOString().slice(0, 10) === dateStr;
    });

    if (filteredKeys.length === 0) {
      showToast(`⚠️ Tidak ada data untuk ${dateStr}`, 'warning');
      return;
    }

    const rawData = filteredKeys.map(key => {
      const suhuEntry = suhuData[key];
      const cahayaEntry = cahayaData[key];
      const lampuEntry = lampuData[key];

      let suhu = suhuEntry?.value ?? suhuEntry ?? 0;
      let cahaya = cahayaEntry?.value ?? cahayaEntry ?? 0;

      let lampu = 0;
      if (lampuEntry !== undefined && lampuEntry !== null) {
        if (typeof lampuEntry === 'object') {
          if (lampuEntry.state !== undefined) {
            lampu = (lampuEntry.state === true || lampuEntry.state === 1 || lampuEntry.state === 'ON') ? 1 : 0;
          } else if (lampuEntry.value !== undefined) {
            lampu = (lampuEntry.value === true || lampuEntry.value === 1 || lampuEntry.value === 'ON') ? 1 : 0;
          }
        } else {
          lampu = (lampuEntry === true || lampuEntry === 1 || lampuEntry === 'ON') ? 1 : 0;
        }
      }

      const timestamp = parseKeyToTimestamp(key);
      return { key, suhu: Number(suhu), cahaya: Number(cahaya), lampu, timestamp };
    });

    applyChartData(rawData);
    showToast(`✅ Menampilkan data ${dateStr} (${rawData.length} titik)`, 'success');
    console.log(`✅ Load history ${dateStr}, titik: ${rawData.length}`);
  } catch (e) {
    console.error('❌ Gagal load by date:', e);
    showToast('❌ Gagal load data: ' + e.message, 'error');
  }
}

function parseKeyToTimestamp(key) {
  try {
    const clean = key.replace(/-000Z$/, '');
    const [datePart, timePart] = clean.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second] = timePart.split('-').map(Number);
    return new Date(year, month - 1, day, hour, minute, second).getTime();
  } catch (e) { return 0; }
}

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
      if (diff < minDiff) { minDiff = diff;
        closest = point; }
    }
    result.push(closest);
  }
  return result;
}

function applyChartData(hourlyData) {
  tempLabels.length = 0;
  tempData.length = 0;
  lightLabels.length = 0;
  sensorData.length = 0;
  if (lampStatusChart) {
    lampStatusChart.data.labels = [];
    lampStatusChart.data.datasets[0].data = [];
  }

  const labels = hourlyData.map(d => {
    const date = new Date(d.timestamp);
    return String(date.getHours()).padStart(2, '0') + ':00';
  });

  hourlyData.forEach((d, i) => {
    tempLabels.push(labels[i]);
    tempData.push(d.suhu);
    lightLabels.push(labels[i]);
    // 🔥 LUX LANGSUNG (BUKAN PERSEN)
    sensorData.push(Math.round(d.cahaya));

    if (lampStatusChart) {
      lampStatusChart.data.labels.push(labels[i]);
      lampStatusChart.data.datasets[0].data.push((d.lampu === true || d.lampu === 1) ? 1 : 0);
    }
  });

  if (tempChart) tempChart.update();
  if (lightChart) lightChart.update();
  if (lampStatusChart) lampStatusChart.update();

  updateStats(hourlyData);
  updateCategoryStats(hourlyData);
  updateLampStats(hourlyData);
  updateTrend(hourlyData);
  updateHeatmap(hourlyData);
  updateHistogram(hourlyData);
}

function updateStats(data) {
  const temps = data.map(d => d.suhu).filter(v => v > 0);
  if (temps.length) {
    const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
    document.getElementById('avgTemp').textContent = avg.toFixed(1) + '°C';
    document.getElementById('maxTemp').textContent = Math.max(...temps).toFixed(1) + '°C';
    document.getElementById('minTemp').textContent = Math.min(...temps).toFixed(1) + '°C';
  }
  const lights = data.map(d => d.cahaya).filter(v => v > 0);
  if (lights.length) {
    const avgL = lights.reduce((a, b) => a + b, 0) / lights.length;
    // 🔥 LUX LANGSUNG
    document.getElementById('avgLight').textContent = Math.round(avgL) + ' lux';
  }
}

function updateCategoryStats(data) {
  const values = data.map(d => d.suhu).filter(v => v > 0);
  if (!values.length) {
    ['cold', 'normal', 'warm', 'hot'].forEach(id => {
      document.getElementById(id + 'Percent').textContent = '0%';
      document.getElementById(id + 'Bar').style.width = '0%';
    });
    return;
  }
  const total = values.length;
  const calc = n => Math.round((n / total) * 100);
  const cold = values.filter(v => v < 25).length;
  const normal = values.filter(v => v >= 25 && v < 30).length;
  const warm = values.filter(v => v >= 30 && v < 34).length;
  const hot = values.filter(v => v >= 34).length;
  document.getElementById('coldPercent').textContent = calc(cold) + '%';
  document.getElementById('normalPercent').textContent = calc(normal) + '%';
  document.getElementById('warmPercent').textContent = calc(warm) + '%';
  document.getElementById('hotPercent').textContent = calc(hot) + '%';
  document.getElementById('coldBar').style.width = calc(cold) + '%';
  document.getElementById('normalBar').style.width = calc(normal) + '%';
  document.getElementById('warmBar').style.width = calc(warm) + '%';
  document.getElementById('hotBar').style.width = calc(hot) + '%';
}

function updateLampStats(data) {
  const lampData = data.filter(d => d.lampu !== undefined && d.lampu !== null);
  if (lampData.length < 2) {
    ['lampOnTime', 'lampOffTime', 'onPercent', 'offPercent', 'lampOnBar', 'lampOffBar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (id === 'lampOnTime' || id === 'lampOffTime') el.textContent = '0.0 jam';
        else if (id === 'onPercent' || id === 'offPercent') el.textContent = id === 'onPercent' ? 'ON: 0%' : 'OFF: 0%';
        else el.style.width = '0%';
      }
    });
    return;
  }

  let totalOn = 0;
  for (let i = 1; i < lampData.length; i++) {
    const duration = (lampData[i].timestamp - lampData[i - 1].timestamp) / 3600000;
    if (lampData[i - 1].lampu === 1) totalOn += duration;
  }
  const totalDurasi = (lampData[lampData.length - 1].timestamp - lampData[0].timestamp) / 3600000;
  const totalOff = totalDurasi - totalOn;
  const onP = totalDurasi > 0 ? Math.round((totalOn / totalDurasi) * 100) : 0;
  const offP = 100 - onP;

  document.getElementById('lampOnTime').textContent = totalOn.toFixed(1) + ' jam';
  document.getElementById('lampOffTime').textContent = totalOff.toFixed(1) + ' jam';
  document.getElementById('onPercent').textContent = `ON: ${onP}%`;
  document.getElementById('offPercent').textContent = `OFF: ${offP}%`;
  document.getElementById('lampOnBar').style.width = onP + '%';
  document.getElementById('lampOffBar').style.width = offP + '%';
}

function updateTrend(data) {
  const container = document.getElementById('trendContainer');
  if (!container) return;
  const days = {};
  data.forEach(d => {
    const day = new Date(d.timestamp).toISOString().slice(0, 10);
    if (!days[day]) days[day] = [];
    days[day].push(d.suhu);
  });
  const now = new Date();
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const vals = days[key] || [];
    const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '--';
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
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const ranges = [0, 6, 12, 18, 24];
  let html = '<thead><tr><th></th>';
  for (let i = 0; i < 4; i++) html += `<th style="font-size:10px;color:var(--muted);">${ranges[i]}-${ranges[i + 1]}</th>`;
  html += '</tr></thead><tbody>';
  days.forEach(day => {
    html += `<tr><td style="font-size:11px;color:var(--muted);">${day.slice(5)}</td>`;
    for (let i = 0; i < 4; i++) {
      const vals = data.filter(d => {
        const dt = new Date(d.timestamp);
        return dt.toISOString().slice(0, 10) === day && dt.getHours() >= ranges[i] && dt.getHours() < ranges[i + 1];
      }).map(d => d.suhu).filter(v => v > 0);
      const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '-';
      let bg = 'rgba(100,116,139,0.2)',
        tc = '#94a3b8';
      if (avg !== '-') {
        if (avg > 30) { bg = 'rgba(239,68,68,0.4)';
          tc = '#ef4444'; } else if (avg > 25) { bg = 'rgba(245,158,11,0.4)';
          tc = '#f59e0b'; } else if (avg > 20) { bg = 'rgba(34,197,94,0.4)';
          tc = '#22c55e'; } else { bg = 'rgba(59,130,246,0.4)';
          tc = '#3b82f6'; }
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
      data: { labels: ['0-10', '10-20', '20-30', '30-40', '40+'], datasets: [{ data: [0, 0, 0, 0, 0], backgroundColor: '#64748b' }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
    return;
  }
  const bins = [0, 10, 20, 25, 30, 35, 40];
  const labels = ['0-10°C', '10-20°C', '20-25°C', '25-30°C', '30-35°C', '35-40°C', '40+°C'];
  const counts = bins.map((b, i) => {
    const next = bins[i + 1] || Infinity;
    return values.filter(v => v >= b && v < next).length;
  });
  new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data: counts, backgroundColor: ['#3b82f6', '#22c55e', '#f59e0b', '#f59e0b', '#ef4444', '#ef4444', '#7c3aed'] }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

export async function exportData(period) {
  const status = DOM.exportStatus;
  if (status) status.textContent = '⏳ Mengambil data...';
  try {
    const now = new Date();
    const start = new Date(now);
    period === 'week' ? start.setDate(now.getDate() - 7) : start.setMonth(now.getMonth() - 1);
    const startStr = start.toISOString();
    const [suhuSnap, cahayaSnap, lampuSnap] = await Promise.all([
      get(ref(db, 'sensor_history/suhu')),
      get(ref(db, 'sensor_history/cahaya')),
      get(ref(db, 'sensor_history/lampu'))
    ]);
    const suhu = suhuSnap.val() || {};
    const cahaya = cahayaSnap.val() || {};
    const lampu = lampuSnap.val() || {};
    const timestamps = new Set([...Object.keys(suhu), ...Object.keys(cahaya), ...Object.keys(lampu)]);
    const filtered = [];
    timestamps.forEach(t => {
      if (t >= startStr) {
        filtered.push({
          timestamp: t,
          suhu: suhu[t]?.value ?? null,
          cahaya: cahaya[t]?.value ?? null,
          lampState: lampu[t]?.state ?? null
        });
      }
    });
    filtered.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (filtered.length === 0) {
      if (status) status.textContent = '⚠️ Tidak ada data untuk periode ini.';
      return;
    }
    let csv = `"LAPORAN DATA SENSOR"\n`;
    csv += `"Tanggal Export","${new Date().toLocaleString('id-ID')}"\n`;
    csv += `"Periode","${period === 'week' ? '1 Minggu' : '1 Bulan'}"\n`;
    csv += `"Total Data","${filtered.length}"\n\n`;
    csv += `"No","Timestamp","Suhu (°C)","Cahaya (lux)","Status Lampu"\n`;
    filtered.forEach((row, i) => {
      csv += `"${i + 1}","${formatTime(row.timestamp)}","${row.suhu?.toFixed(1) || ''}","${row.cahaya || ''}","${row.lampState === true ? 'ON' : row.lampState === false ? 'OFF' : ''}"\n`;
    });
    csv += `\n"--- AKHIR LAPORAN ---"`;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan_sensor_${period}_${now.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (status) status.textContent = `✅ Berhasil ekspor ${filtered.length} data!`;
  } catch (e) {
    console.error(e);
    if (DOM.exportStatus) DOM.exportStatus.textContent = '❌ Gagal ekspor data. Cek console.';
  }
}

export async function exportPDF() {
  if (DOM.exportStatus) DOM.exportStatus.textContent = '⏳ Membuat PDF...';
  try {
    if (typeof window.jspdf === 'undefined') {
      alert('❌ Library PDF tidak ditemukan.');
      return;
    }
    const tempCanvas = document.getElementById('tempChart');
    const lightCanvas = document.getElementById('lightChart');
    if (!tempCanvas || !lightCanvas) {
      alert('❌ Grafik tidak ditemukan.');
      return;
    }
    const tempImg = tempCanvas.toDataURL('image/png');
    const lightImg = lightCanvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(16);
    doc.text('📊 LAPORAN SENSOR', w / 2, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`📅 ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`, w / 2, 28, { align: 'center' });
    const imgW = (w - 20) / 2 - 4;
    const imgH = imgW * 0.6;
    doc.addImage(tempImg, 'PNG', 8, 35, imgW, imgH);
    doc.text('🌡️ Suhu', 8 + imgW / 2, 35 + imgH + 5, { align: 'center' });
    doc.addImage(lightImg, 'PNG', 8 + imgW + 8, 35, imgW, imgH);
    doc.text('💡 Cahaya', 8 + imgW + 8 + imgW / 2, 35 + imgH + 5, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`🔄 Data terakhir: ${new Date().toLocaleString('id-ID')}`, w / 2, h - 8, { align: 'center' });
    doc.save(`laporan_grafik_${new Date().toISOString().slice(0, 10)}.pdf`);
    if (DOM.exportStatus) DOM.exportStatus.textContent = '✅ PDF berhasil diunduh!';
  } catch (e) {
    console.error(e);
    if (DOM.exportStatus) DOM.exportStatus.textContent = '❌ Gagal ekspor PDF. Cek console.';
    alert('❌ Gagal ekspor PDF. Pastikan grafik sudah dimuat.');
  }
}
