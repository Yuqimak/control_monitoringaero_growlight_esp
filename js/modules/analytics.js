// ============================================
// ANALYTICS: Charts, Export, Statistik
// ============================================

import { db } from '../firebase.js';
import { ref, get, query, orderByKey, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { state, DOM, showToast, formatTime } from './core.js';
import { getDays } from './ui.js';

// ---- CHART VARIABLES ----
const MAX_POINTS = 100;
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
  
  // Temp chart
  const tEl = document.getElementById('tempChart');
  if (tEl) {
    tempChart = new Chart(tEl, {
      type: 'line',
      data: { labels: tempLabels, datasets: [{ label: 'Temperature (°C)', data: tempData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.2)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 }] },
      options: opts
    });
  }
  
  // Light chart
  const lEl = document.getElementById('lightChart');
  if (lEl) {
    lightChart = new Chart(lEl, {
      type: 'line',
      data: { labels: lightLabels, datasets: [{ label: 'Sensor Light (%)', data: sensorData, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.2)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 }] },
      options: opts
    });
  }
  
  // Lamp status chart (bar)
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
  
  // Dashboard mini chart
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
  
  // Dashboard mini chart
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
    
    // Reset data
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
  } catch(e) {
    console.warn('Could not load chart history:', e);
  }
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
    csv += `"No","Timestamp","Suhu (°C)","Cahaya (%)","Status Lampu"\n`;
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
