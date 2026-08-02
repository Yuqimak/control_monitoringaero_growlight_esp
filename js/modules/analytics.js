// ============================================
// ANALYTICS: Charts, Export, Statistik (OPTIMIZED)
// ============================================

import { db } from '../firebase.js';
import { ref, get, query, orderByKey, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { state, DOM, showToast, formatTime } from './core.js';
import { getDays } from './ui.js';

// ---- CHART VARIABLES ----
const MAX_POINTS = 288; // data mentah max yang diambil dari Firebase
export const tempLabels = [], tempData = [], lightLabels = [], sensorData = [];
export let tempChart = null, lightChart = null, lampStatusChart = null;
const dashTempLabels = [], dashTempData = [];
let dashTempChart = null;

// ---- CACHE ----
const CACHE_KEY = 'analytics_24h_cache';
const CACHE_DURATION = 30 * 60 * 1000; // 30 menit

// ---- INIT CHARTS (TETAP SAMA) ----
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

// ---- UPDATE CHARTS (REAL-TIME, TETAP SAMA) ----
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
// LOAD HISTORY (REVISI HEMAT - SATU QUERY, SAMPLING 1 JAM)
// ============================================
export async function loadChartHistory() {
  // Cek cache dulu
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
    // 1. Ambil hanya MAX_POINTS data mentah terakhir dari path suhu (sebagai index)
    const suhuRef = ref(db, 'sensor_history/suhu');
    const suhuSnap = await get(query(suhuRef, orderByKey(), limitToLast(MAX_POINTS)));
    const suhuData = suhuSnap.val() || {};
    const allKeys = Object.keys(suhuData).sort(); // key format "YYYY-MM-DDTHH-MM-SS"

    if (allKeys.length === 0) {
      console.warn('⚠️ Tidak ada data history.');
      return;
    }

    // 2. Ambil data cahaya & lampu hanya untuk key yang sama (biar satu kali fetch saja)
    // Gunakan Promise.all untuk paralel, tapi kita batasi hanya MAX_POINTS key
    const cahayaRef = ref(db, 'sensor_history/cahaya');
    const lampuRef = ref(db, 'sensor_history/lampu');
    const [cahayaSnap, lampuSnap] = await Promise.all([
      get(cahayaRef),   // bisa banyak, tapi kita filter setelahnya
      get(lampuRef)
    ]);
    const cahayaData = cahayaSnap.val() || {};
    const lampuData = lampuSnap.val() || {};

    // 3. Bangun array data mentah (hanya untuk key yang ada di suhuData)
    const rawData = allKeys.map(key => ({
      key,
      suhu: suhuData[key]?.value || 0,
      cahaya: cahayaData[key]?.value || 0,
      lampu: lampuData[key]?.state ? 1 : 0,
      timestamp: keyToTimestamp(key) // konversi key ke unix ms
    }));

    // 4. Filter hanya 24 jam terakhir (lebih hemat lagi)
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const recentData = rawData.filter(d => d.timestamp >= oneDayAgo);

    // 5. Sampling 1 titik per jam (24 titik)
    const hourlyData = reduceToHourly(recentData, 24);

    // 6. Simpan cache
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: hourlyData
    }));

    // 7. Update semua chart & statistik
    applyChartData(hourlyData);
    console.log('✅ History loaded, titik:', hourlyData.length);

  } catch (e) {
    console.error('❌ Gagal load history:', e);
  }
}

// ---- KONVERSI KEY "YYYY-MM-DDTHH-MM-SS" KE UNIX TIMESTAMP (ms) ----
function keyToTimestamp(key) {
  // key: "2025-06-15T14-30-05"
  const parts = key.replace('T', ' ').split(' ');
  const dateParts = parts[0].split('-'); // [YYYY, MM, DD]
  const timeParts = parts[1].split('-'); // [HH, MM, SS]
  return new Date(
    parseInt(dateParts[0]),
    parseInt(dateParts[1]) - 1,
    parseInt(dateParts[2]),
    parseInt(timeParts[0]),
    parseInt(timeParts[1]),
    parseInt(timeParts[2])
  ).getTime();
}

// ---- REDUKSI JADI 1 TITIK PER JAM ----
function reduceToHourly(data, totalPoints) {
  if (data.length === 0) return [];
  // Urutkan berdasarkan timestamp (seharusnya sudah terurut)
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
      if (diff < minDiff) {
        minDiff = diff;
        closest = point;
      }
    }
    result.push(closest);
  }
  return result;
}

// ---- APLIKASIKAN DATA KE CHART & STATISTIK ----
function applyChartData(hourlyData) {
  // Clear existing
  tempLabels.length = 0; tempData.length = 0;
  lightLabels.length = 0; sensorData.length = 0;
  if (lampStatusChart) {
    lampStatusChart.data.labels = [];
    lampStatusChart.data.datasets[0].data = [];
  }
  
  // Format label jam
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
  
  // Update semua statistik dengan data mentah (suhuData asli dari hourly)
  // Karena hourlyData sudah objek dengan suhu, cahaya, lampu, kita bisa pakai
  updateStats(hourlyData);
  updateCategoryStats(hourlyData);
  updateLampStats(hourlyData);
  updateTrend(hourlyData);
  updateHeatmap(hourlyData);
  updateHistogram(hourlyData);
}

// ============================================
// STATISTIK (DISESUAIKAN DENGAN DATA HEMAT)
// ============================================

function updateStats(hourlyData) {
  const temps = hourlyData.map(d => d.suhu).filter(v => v > 0);
  if (temps.length > 0) {
    const avg = temps.reduce((a,b)=>a+b,0)/temps.length;
    const max = Math.max(...temps);
    const min = Math.min(...temps);
    document.getElementById('avgTemp').textContent = avg.toFixed(1) + '°C';
    document.getElementById('maxTemp').textContent = max.toFixed(1) + '°C';
    document.getElementById('minTemp').textContent = min.toFixed(1) + '°C';
  }
  const lights = hourlyData.map(d => d.cahaya).filter(v => v > 0);
  if (lights.length > 0) {
    const avgL = lights.reduce((a,b)=>a+b,0)/lights.length;
    document.getElementById('avgLight').textContent = Math.min(100, Math.round(avgL/5000*100)) + '%';
  }
}

function updateCategoryStats(hourlyData) {
  const values = hourlyData.map(d => d.suhu).filter(v => v > 0);
  if (values.length === 0) {
    ['cold','normal','warm','hot'].forEach(id => {
      document.getElementById(id+'Percent').textContent = '0%';
      document.getElementById(id+'Bar').style.width = '0%';
    });
    return;
  }
  const total = values.length;
  const cold = values.filter(v => v < 25).length;
  const normal = values.filter(v => v >= 25 && v < 30).length;
  const warm = values.filter(v => v >= 30 && v < 34).length;
  const hot = values.filter(v => v >= 34).length;
  const calc = n => Math.round((n/total)*100);
  document.getElementById('coldPercent').textContent = calc(cold)+'%';
  document.getElementById('normalPercent').textContent = calc(normal)+'%';
  document.getElementById('warmPercent').textContent = calc(warm)+'%';
  document.getElementById('hotPercent').textContent = calc(hot)+'%';
  document.getElementById('coldBar').style.width = calc(cold)+'%';
  document.getElementById('normalBar').style.width = calc(normal)+'%';
  document.getElementById('warmBar').style.width = calc(warm)+'%';
  document.getElementById('hotBar').style.width = calc(hot)+'%';
}

function updateLampStats(hourlyData) {
  const total = hourlyData.length;
  if (total === 0) return;
  const onCount = hourlyData.filter(d => d.lampu === 1).length;
  const offCount = total - onCount;
  const onPercent = Math.round((onCount/total)*100);
  const offPercent = 100 - onPercent;
  // Asumsikan satu titik = 1 jam (karena sampling per jam)
  const onHours = onCount;
  const offHours = offCount;
  document.getElementById('lampOnTime').textContent = `${onHours} jam`;
  document.getElementById('lampOffTime').textContent = `${offHours} jam`;
  document.getElementById('onPercent').textContent = `ON: ${onPercent}%`;
  document.getElementById('offPercent').textContent = `OFF: ${offPercent}%`;
  document.getElementById('lampOnBar').style.width = onPercent+'%';
  document.getElementById('lampOffBar').style.width = offPercent+'%';
}

function updateTrend(hourlyData) {
  const container = document.getElementById('trendContainer');
  if (!container) return;
  // Group by day
  const days = {};
  hourlyData.forEach(d => {
    const date = new Date(d.timestamp);
    const dayKey = date.toISOString().slice(0,10);
    if (!days[dayKey]) days[dayKey] = [];
    days[dayKey].push(d.suhu);
  });
  const now = new Date();
  const last7 = [];
  for (let i=6; i>=0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate()-i);
    last7.push(d.toISOString().slice(0,10));
  }
  container.innerHTML = '';
  last7.forEach(day => {
    const vals = days[day] || [];
    const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
    const el = document.createElement('div');
    el.style.cssText = 'text-align:center; background:rgba(255,255,255,.04); padding:8px 4px; border-radius:8px;';
    const dayLabel = day.slice(5);
    const tempColor = avg > 30 ? '#ef4444' : avg > 25 ? '#f59e0b' : avg > 20 ? '#22c55e' : '#3b82f6';
    el.innerHTML = `<div style="font-size:11px; color:var(--muted);">${dayLabel}</div><div style="font-size:16px; font-weight:600; color:${tempColor};">${avg ? avg.toFixed(1)+'°' : '--'}</div>`;
    container.appendChild(el);
  });
}

function updateHeatmap(hourlyData) {
  const table = document.getElementById('heatmapTable');
  if (!table) return;
  const now = new Date();
  const days = [];
  for (let i=6; i>=0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate()-i);
    days.push(d.toISOString().slice(0,10));
  }
  const hours = ['00-06','06-12','12-18','18-24'];
  let html = '<thead><tr><th>Hari</th>'+hours.map(h=>`<th style="font-size:10px;color:var(--muted);">${h}</th>`).join('')+'</tr></thead><tbody>';
  days.forEach(day => {
    html += `<tr><td style="font-size:11px;color:var(--muted);">${day.slice(5)}</td>`;
    hours.forEach(range => {
      const [start,end] = range.split('-').map(Number);
      const values = hourlyData.filter(d => {
        const date = new Date(d.timestamp);
        return date.toISOString().slice(0,10) === day && date.getHours() >= start && date.getHours() < end;
      }).map(d => d.suhu).filter(v=>v>0);
      const avg = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
      let bg = 'rgba(100,116,139,0.2)', tc = '#94a3b8';
      if (avg>0) {
        if (avg>30){bg='rgba(239,68,68,0.4)';tc='#ef4444';}
        else if(avg>25){bg='rgba(245,158,11,0.4)';tc='#f59e0b';}
        else if(avg>20){bg='rgba(34,197,94,0.4)';tc='#22c55e';}
        else{bg='rgba(59,130,246,0.4)';tc='#3b82f6';}
      }
      html += `<td style="background:${bg};text-align:center;padding:6px 4px;border-radius:4px;font-size:12px;color:${tc};">${avg?avg.toFixed(1):'-'}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
}

function updateHistogram(hourlyData) {
  const canvas = document.getElementById('histogramChart');
  if (!canvas) return;
  const values = hourlyData.map(d => d.suhu).filter(v => v > 0);
  let chart = Chart.getChart(canvas);
  if (chart) chart.destroy();
  if (values.length === 0) {
    new Chart(canvas, {
      type: 'bar',
      data: { labels: ['0-10','10-20','20-30','30-40','40+'], datasets: [{ data: [0,0,0,0,0], backgroundColor: '#64748b' }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } }
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
    data: { labels, datasets: [{ data: counts, backgroundColor: ['#3b82f6','#22c55e','#f59e0b','#f59e0b','#ef4444','#ef4444','#7c3aed'], borderRadius: 4 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } }
  });
}

// ---- EXPORT CSV (TIDAK BERUBAH) ----
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

// ---- EXPORT PDF (TIDAK BERUBAH) ----
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
