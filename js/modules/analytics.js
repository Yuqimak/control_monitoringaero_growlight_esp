// ============================================
// ANALYTICS: Charts, Export, Statistik (FIXED)
// ============================================

import { db } from '../firebase.js';
import { ref, get, query, orderByKey, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { state, DOM, showToast, formatTime } from './core.js';
import { getDays } from './ui.js';

// ---- CHART VARIABLES ----
const MAX_POINTS = 288;
export const tempLabels = [], tempData = [], lightLabels = [], sensorData = [];
export let tempChart = null, lightChart = null, lampStatusChart = null;
const dashTempLabels = [], dashTempData = [];
let dashTempChart = null;

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

// ---- UPDATE CHARTS ----
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

// ---- LOAD HISTORY ----
export async function loadChartHistory() {
  try {
    const suhuSnap = await get(query(ref(db, 'sensor_history/suhu'), orderByKey(), limitToLast(MAX_POINTS)));
    const cahayaSnap = await get(query(ref(db, 'sensor_history/cahaya'), orderByKey(), limitToLast(MAX_POINTS)));
    const lampuSnap = await get(query(ref(db, 'sensor_history/lampu'), orderByKey(), limitToLast(MAX_POINTS)));
    
    const suhuData = suhuSnap.val() || {};
    const cahayaData = cahayaSnap.val() || {};
    const lampuData = lampuSnap.val() || {};
    const keys = Object.keys(suhuData).sort();
    
    tempLabels.length = 0; tempData.length = 0;
    sensorData.length = 0;
    if (lampStatusChart) { lampStatusChart.data.labels = []; lampStatusChart.data.datasets[0].data = []; }
    
    keys.forEach(key => {
      const parts = key.replace('T', ' ').split(' ');
      const date = parts[0].split('-').slice(2).join('-');
      const time = parts[1].split('-').slice(0, 2).join(':');
      const label = date + ' ' + time;
      
      const rawCahaya = cahayaData[key]?.value || 0;
      const normalizedCahaya = Math.min(100, Math.round(rawCahaya / 5000 * 100));
      
      tempLabels.push(label);
      tempData.push(suhuData[key]?.value || 0);
      sensorData.push(normalizedCahaya);
      
      if (lampStatusChart) {
        lampStatusChart.data.labels.push(label);
        lampStatusChart.data.datasets[0].data.push(lampuData[key]?.state ? 1 : 0);
      }
    });
    
    if (tempChart) tempChart.update();
    if (lightChart) lightChart.update();
    if (lampStatusChart) lampStatusChart.update();
    
    updateStats(suhuData, cahayaData);
    updateLampStats(lampuData);
    updateCategoryStats(suhuData);
    updateTrend(suhuData);
    updateHeatmap(suhuData);
    updateHistogram(suhuData);
    
    console.log("✅ Analytics: Data history berhasil dimuat!");
  } catch(e) {
    console.warn('❌ Gagal load chart history:', e);
  }
}

// ---- UPDATE STATISTIK ----
function updateStats(suhuData, cahayaData) {
  const suhuValues = Object.values(suhuData).map(d => d.value || 0).filter(v => v > 0);
  if (suhuValues.length > 0) {
    const avg = suhuValues.reduce((a, b) => a + b, 0) / suhuValues.length;
    const max = Math.max(...suhuValues);
    const min = Math.min(...suhuValues);
    document.getElementById('avgTemp').textContent = avg.toFixed(1) + '°C';
    document.getElementById('maxTemp').textContent = max.toFixed(1) + '°C';
    document.getElementById('minTemp').textContent = min.toFixed(1) + '°C';
  }
  
  const cahayaValues = Object.values(cahayaData).map(d => d.value || 0).filter(v => v > 0);
  if (cahayaValues.length > 0) {
    const avgCahaya = cahayaValues.reduce((a, b) => a + b, 0) / cahayaValues.length;
    document.getElementById('avgLight').textContent = Math.min(100, Math.round(avgCahaya / 5000 * 100)) + '%';
  }
}

// ---- UPDATE KATEGORI SUHU ----
function updateCategoryStats(data) {
  const values = Object.values(data).map(d => d.value || 0).filter(v => v > 0);
  if (values.length === 0) {
    ['cold', 'normal', 'warm', 'hot'].forEach(id => {
      document.getElementById(id + 'Percent').textContent = '0%';
      document.getElementById(id + 'Bar').style.width = '0%';
    });
    return;
  }
  const total = values.length;
  const cold = values.filter(v => v < 25).length;
  const normal = values.filter(v => v >= 25 && v < 30).length;
  const warm = values.filter(v => v >= 30 && v < 34).length;
  const hot = values.filter(v => v >= 34).length;
  const calc = (count) => Math.round((count / total) * 100);
  document.getElementById('coldPercent').textContent = calc(cold) + '%';
  document.getElementById('normalPercent').textContent = calc(normal) + '%';
  document.getElementById('warmPercent').textContent = calc(warm) + '%';
  document.getElementById('hotPercent').textContent = calc(hot) + '%';
  document.getElementById('coldBar').style.width = calc(cold) + '%';
  document.getElementById('normalBar').style.width = calc(normal) + '%';
  document.getElementById('warmBar').style.width = calc(warm) + '%';
  document.getElementById('hotBar').style.width = calc(hot) + '%';
}

// ---- UPDATE LAMP STATS ----
function updateLampStats(data) {
  const values = Object.values(data);
  const total = values.length;
  if (total === 0) return;
  const onCount = values.filter(d => d.state === true).length;
  const offCount = total - onCount;
  const onPercent = Math.round((onCount / total) * 100);
  const offPercent = Math.round((offCount / total) * 100);
  const avgInterval = 5;
  const onMinutes = onCount * avgInterval;
  const offMinutes = offCount * avgInterval;
  document.getElementById('lampOnTime').textContent = `${Math.floor(onMinutes/60)} jam ${Math.round(onMinutes%60)} menit`;
  document.getElementById('lampOffTime').textContent = `${Math.floor(offMinutes/60)} jam ${Math.round(offMinutes%60)} menit`;
  document.getElementById('onPercent').textContent = `ON: ${onPercent}%`;
  document.getElementById('offPercent').textContent = `OFF: ${offPercent}%`;
  document.getElementById('lampOnBar').style.width = onPercent + '%';
  document.getElementById('lampOffBar').style.width = offPercent + '%';
}

// ---- UPDATE TREN ----
function updateTrend(data) {
  const container = document.getElementById('trendContainer');
  if (!container) return;
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    days.push(key);
  }
  container.innerHTML = '';
  days.forEach(day => {
    const dayData = Object.keys(data).filter(key => key.startsWith(day));
    const values = dayData.map(key => data[key].value || 0).filter(v => v > 0);
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const el = document.createElement('div');
    el.style.cssText = 'text-align:center; background:rgba(255,255,255,.04); padding:8px 4px; border-radius:8px;';
    const dayLabel = day.slice(5);
    const tempColor = avg > 30 ? '#ef4444' : avg > 25 ? '#f59e0b' : avg > 20 ? '#22c55e' : '#3b82f6';
    el.innerHTML = `<div style="font-size:11px; color:var(--muted);">${dayLabel}</div><div style="font-size:16px; font-weight:600; color:${tempColor};">${avg ? avg.toFixed(1) + '°' : '--'}</div>`;
    container.appendChild(el);
  });
}

// ---- UPDATE HEATMAP ----
function updateHeatmap(data) {
  const table = document.getElementById('heatmapTable');
  if (!table) return;
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    days.push(key);
  }
  const hours = ['00-06', '06-12', '12-18', '18-24'];
  let html = '<thead><tr><th>Hari</th>';
  hours.forEach(h => { html += `<th style="font-size:10px; color:var(--muted);">${h}</th>`; });
  html += '</tr></thead><tbody>';
  days.forEach(day => {
    html += `<tr><td style="font-size:11px; color:var(--muted);">${day.slice(5)}</td>`;
    hours.forEach(range => {
      const [start, end] = range.split('-').map(Number);
      const dayData = Object.keys(data).filter(key => key.startsWith(day));
      const values = dayData.map(key => ({ key, val: data[key].value || 0 })).filter(d => {
        const hour = parseInt(d.key.split('T')[1].split('-')[0]);
        return hour >= start && hour < end;
      });
      const avg = values.length > 0 ? values.reduce((a, b) => a + b.val, 0) / values.length : 0;
      let bgColor = 'rgba(100,116,139,0.2)';
      let textColor = '#94a3b8';
      if (avg > 0) {
        if (avg > 30) { bgColor = 'rgba(239,68,68,0.4)'; textColor = '#ef4444'; }
        else if (avg > 25) { bgColor = 'rgba(245,158,11,0.4)'; textColor = '#f59e0b'; }
        else if (avg > 20) { bgColor = 'rgba(34,197,94,0.4)'; textColor = '#22c55e'; }
        else { bgColor = 'rgba(59,130,246,0.4)'; textColor = '#3b82f6'; }
      }
      html += `<td style="background:${bgColor}; text-align:center; padding:6px 4px; border-radius:4px; font-size:12px; color:${textColor};">${avg ? avg.toFixed(1) : '-'}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
}

// ---- UPDATE HISTOGRAM ----
function updateHistogram(data) {
  const canvas = document.getElementById('histogramChart');
  if (!canvas) return;
  const values = Object.values(data).map(d => d.value || 0).filter(v => v > 0);
  let chart = Chart.getChart(canvas);
  if (chart) chart.destroy();
  if (values.length === 0) {
    new Chart(canvas, {
      type: 'bar',
      data: { labels: ['0-10', '10-20', '20-30', '30-40', '40+'], datasets: [{ data: [0,0,0,0,0], backgroundColor: '#64748b' }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8', stepSize: 1 } } } }
    });
    return;
  }
  const bins = [0, 10, 20, 25, 30, 35, 40];
  const labels = ['0-10°C', '10-20°C', '20-25°C', '25-30°C', '30-35°C', '35-40°C', '40+°C'];
  const counts = bins.map((bin, i) => {
    const next = bins[i+1] || Infinity;
    return values.filter(v => v >= bin && v < next).length;
  });
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Frekuensi',
        data: counts,
        backgroundColor: ['#3b82f6', '#22c55e', '#f59e0b', '#f59e0b', '#ef4444', '#ef4444', '#7c3aed'],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#94a3b8', maxTicksLimit: 7 } }, y: { ticks: { color: '#94a3b8', stepSize: 1 } } }
    }
  });
}

// ---- EXPORT CSV ----
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
    let csv = `"LAPORAN DATA SENSOR GREENHOUSE"\n`;
    csv += `"Tanggal Export","${new Date().toLocaleString('id-ID')}"\n`;
    csv += `"Periode","${period === 'week' ? '1 Minggu' : '1 Bulan'}"\n`;
    csv += `"Total Data","${filtered.length}"\n\n`;
    csv += `"No","Timestamp","Suhu (°C)","Cahaya (lux)","Status Lampu"\n`;
    filtered.forEach((row, i) => {
      csv += `"${i+1}","${formatTime(row.timestamp)}","${row.suhu?.toFixed(1) || ''}","${row.cahaya || ''}","${row.lampState === true ? 'ON' : row.lampState === false ? 'OFF' : ''}"\n`;
    });
    csv += `\n"--- AKHIR LAPORAN ---"`;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan_sensor_${period}_${now.toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (status) status.textContent = `✅ Berhasil ekspor ${filtered.length} data!`;
  } catch(e) {
    console.error(e);
    if (DOM.exportStatus) DOM.exportStatus.textContent = '❌ Gagal ekspor data. Cek console.';
  }
}

// ---- EXPORT PDF ----
export async function exportPDF() {
  if (DOM.exportStatus) DOM.exportStatus.textContent = '⏳ Membuat PDF...';
  try {
    if (typeof window.jspdf === 'undefined') {
      alert('❌ Library PDF tidak ditemukan. Pastikan file jsPDF sudah di-load.');
      if (DOM.exportStatus) DOM.exportStatus.textContent = '❌ Library PDF tidak ditemukan.';
      return;
    }
    const tempCanvas = document.getElementById('tempChart');
    const lightCanvas = document.getElementById('lightChart');
    if (!tempCanvas || !lightCanvas) {
      alert('❌ Grafik tidak ditemukan.');
      if (DOM.exportStatus) DOM.exportStatus.textContent = '❌ Grafik tidak ditemukan.';
      return;
    }
    const tempImg = tempCanvas.toDataURL('image/png');
    const lightImg = lightCanvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(16);
    doc.text('📊 LAPORAN SENSOR GREENHOUSE', w/2, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`📅 ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`, w/2, 28, { align: 'center' });
    const imgW = (w - 20) / 2 - 4;
    const imgH = imgW * 0.6;
    doc.addImage(tempImg, 'PNG', 8, 35, imgW, imgH);
    doc.text('🌡️ Suhu Realtime', 8 + imgW/2, 35 + imgH + 5, { align: 'center' });
    doc.addImage(lightImg, 'PNG', 8 + imgW + 8, 35, imgW, imgH);
    doc.text('💡 Intensitas Cahaya', 8 + imgW + 8 + imgW/2, 35 + imgH + 5, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`🔄 Data terakhir: ${new Date().toLocaleString('id-ID')}`, w/2, h - 8, { align: 'center' });
    doc.text('Sistem IoT Greenhouse - Tugas Akhir', w/2, h - 4, { align: 'center' });
    doc.save(`laporan_grafik_${new Date().toISOString().slice(0,10)}.pdf`);
    if (DOM.exportStatus) DOM.exportStatus.textContent = '✅ PDF berhasil diunduh!';
  } catch(e) {
    console.error(e);
    if (DOM.exportStatus) DOM.exportStatus.textContent = '❌ Gagal ekspor PDF. Cek console.';
    alert('❌ Gagal ekspor PDF. Pastikan grafik sudah dimuat.');
  }
}