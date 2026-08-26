// ============================================
// ANALYTICS: FULL CODE (FIX HEATMAP + EXPORT)
// ============================================

import { db } from '../firebase.js';
import { state, DOM, showToast, formatTime } from './core.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

console.log('📊 analytics.js loaded (FIX HEATMAP + EXPORT)');

const MAX_POINTS = 96;
const CACHE_KEY = 'analytics_24h_cache_hemat';

export const tempLabels = [], tempData = [], lightLabels = [], sensorData = [];
export let tempChart = null, lightChart = null, lampStatusChart = null, humidityChart = null;
const dashTempLabels = [], dashTempData = [];
export let dashTempChart = null;

// ============================================
// TOGGLE EXPAND
// ============================================
window.toggleExpand = function(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    wrapper.classList.toggle('expanded');
    const canvas = wrapper.querySelector('canvas');
    if (canvas) {
        const chart = Chart.getChart(canvas);
        if (chart) chart.resize();
    }
};

// ============================================
// CHART OPTIONS
// ============================================
function getChartOptions() {
    const isMobile = window.innerWidth < 768;
    return {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { labels: { color: '#cbd5e1', font: { size: isMobile ? 10 : 12 }, boxWidth: isMobile ? 10 : 15, padding: isMobile ? 5 : 10 } },
            tooltip: { bodyFont: { size: isMobile ? 10 : 12 }, titleFont: { size: isMobile ? 10 : 12 } }
        },
        scales: {
            x: { ticks: { color: '#94a3b8', maxTicksLimit: isMobile ? 6 : 12, font: { size: isMobile ? 8 : 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#94a3b8', font: { size: isMobile ? 8 : 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
    };
}

// ============================================
// INIT CHARTS
// ============================================
export function initCharts() {
    console.log('📊 initCharts');
    if (typeof Chart === 'undefined') { setTimeout(() => initCharts(), 500); return; }

    const isMobile = window.innerWidth < 768;
    const opts = getChartOptions();

    // TEMP CHART
    const tEl = document.getElementById('tempChart');
    if (tEl) {
        const existing = Chart.getChart(tEl);
        if (existing) existing.destroy();
        tempChart = new Chart(tEl, {
            type: 'line',
            data: {
                labels: tempLabels.length > 0 ? tempLabels : ['Belum Ada Data'],
                datasets: [{ 
                    label: 'Temperature (°C)', 
                    data: tempData.length > 0 ? tempData : [0], 
                    borderColor: '#22c55e', 
                    backgroundColor: 'rgba(34,197,94,0.2)', 
                    borderWidth: 2, 
                    fill: true, 
                    tension: 0.4, 
                    pointRadius: isMobile ? 6 : 4,
                    pointHoverRadius: isMobile ? 10 : 6,
                    pointBackgroundColor: '#22c55e' 
                }]
            },
            options: opts
        });
    }

    // LIGHT CHART
    const lEl = document.getElementById('lightChart');
    if (lEl) {
        const existing = Chart.getChart(lEl);
        if (existing) existing.destroy();
        lightChart = new Chart(lEl, {
            type: 'line',
            data: {
                labels: lightLabels.length > 0 ? lightLabels : ['Belum Ada Data'],
                datasets: [{ 
                    label: 'Sensor Light (lux)', 
                    data: sensorData.length > 0 ? sensorData : [0], 
                    borderColor: '#f59e0b', 
                    backgroundColor: 'rgba(245,158,11,0.2)', 
                    borderWidth: 2, 
                    fill: true, 
                    tension: 0.4, 
                    pointRadius: isMobile ? 6 : 4,
                    pointHoverRadius: isMobile ? 10 : 6,
                    pointBackgroundColor: '#f59e0b' 
                }]
            },
            options: opts
        });
    }

    // HUMIDITY CHART (TERPISAH)
    const hEl = document.getElementById('humidityChart');
    if (hEl) {
        const existing = Chart.getChart(hEl);
        if (existing) existing.destroy();
        humidityChart = new Chart(hEl, {
            type: 'line',
            data: {
                labels: tempLabels.length > 0 ? tempLabels : ['Belum Ada Data'],
                datasets: [{ 
                    label: 'Kelembapan (%)', 
                    data: tempData.length > 0 ? tempData : [0], 
                    borderColor: '#38bdf8', 
                    backgroundColor: 'rgba(56,189,248,0.2)', 
                    borderWidth: 2, 
                    fill: true, 
                    tension: 0.4, 
                    pointRadius: isMobile ? 6 : 4,
                    pointHoverRadius: isMobile ? 10 : 6,
                    pointBackgroundColor: '#38bdf8' 
                }]
            },
            options: opts
        });
    }

    // LAMP STATUS CHART
    const lsEl = document.getElementById('lampStatusChart');
    if (lsEl) {
        const existing = Chart.getChart(lsEl);
        if (existing) existing.destroy();
        lampStatusChart = new Chart(lsEl, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Status Lampu', data: [], backgroundColor: (ctx) => ctx.dataset.data[ctx.dataIndex] === 1 ? '#22c55e' : '#ef4444', borderWidth: 1, borderRadius: 4, barPercentage: isMobile ? 0.8 : 0.6 }] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.parsed.y === 1 ? 'ON' : 'OFF' } } },
                scales: {
                    x: { ticks: { color: '#94a3b8', maxTicksLimit: isMobile ? 6 : 10, font: { size: isMobile ? 8 : 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#94a3b8', stepSize: 1, callback: (v) => v === 1 ? 'ON' : 'OFF', font: { size: isMobile ? 8 : 10 } }, min: -0.5, max: 1.5, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    }

    // DASHBOARD CHART
    const dEl = document.getElementById('dashTempChart');
    if (dEl) {
        const existing = Chart.getChart(dEl);
        if (existing) existing.destroy();
        dashTempChart = new Chart(dEl, {
            type: 'line',
            data: { labels: dashTempLabels.length > 0 ? dashTempLabels : ['-'], datasets: [{ label: 'Suhu (°C)', data: dashTempData.length > 0 ? dashTempData : [0], borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: isMobile ? 6 : 3, pointHoverRadius: isMobile ? 10 : 6 }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { x: { display: true, ticks: { color: '#94a3b8', maxTicksLimit: isMobile ? 5 : 10, font: { size: isMobile ? 7 : 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { display: true, ticks: { color: '#94a3b8', font: { size: isMobile ? 7 : 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
        });
    }
    console.log('✅ All charts initialized');
}

// ============================================
// UPDATE CHARTS (ANALYTICS)
// ============================================
let lastChartUpdate = 0;
const CHART_THROTTLE = 5000;

export function updateCharts(time) {
    const now = Date.now();
    if (now - lastChartUpdate < CHART_THROTTLE) return;
    lastChartUpdate = now;

    const temp = state.temperature || 0;
    const light = state.sensorLight || 0;
    const lamp = state.lampState || false;
    const hum = state.humidity || 0;

    if (tempChart && tempChart.data) {
        tempLabels.push(time);
        tempData.push(temp);
        if (tempLabels.length > MAX_POINTS) { tempLabels.shift(); tempData.shift(); }
        tempChart.update('none');
    }
    if (humidityChart && humidityChart.data) {
        humidityChart.data.labels = tempLabels;
        humidityChart.data.datasets[0].data = tempData.map((_, i) => {
            return hum || 50;
        });
        humidityChart.update('none');
    }
    if (lightChart && lightChart.data) {
        lightLabels.push(time);
        sensorData.push(light);
        if (lightLabels.length > MAX_POINTS) { lightLabels.shift(); sensorData.shift(); }
        lightChart.update('none');
    }
    if (lampStatusChart && lampStatusChart.data) {
        lampStatusChart.data.labels.push(time);
        lampStatusChart.data.datasets[0].data.push(lamp ? 1 : 0);
        if (lampStatusChart.data.labels.length > MAX_POINTS) {
            lampStatusChart.data.labels.shift();
            lampStatusChart.data.datasets[0].data.shift();
        }
        lampStatusChart.update('none');
    }
    if (dashTempChart && dashTempChart.data) {
        dashTempLabels.push(time);
        dashTempData.push(temp);
        if (dashTempLabels.length > 15) { dashTempLabels.shift(); dashTempData.shift(); }
        dashTempChart.update('none');
    }
}

// ============================================
// PARSE TIMESTAMP
// ============================================
function parseKeyToTimestamp(key) {
    try {
        const clean = key.replace(/-000Z$/, '').replace(/Z$/, '');
        const parts = clean.split('T');
        if (parts.length !== 2) return 0;
        const dateParts = parts[0].split('-').map(Number);
        const timeParts = parts[1].split('-').map(Number);
        if (dateParts.length !== 3 || timeParts.length !== 3) return 0;
        const [year, month, day] = dateParts;
        const [hour, minute, second] = timeParts;
        if (year < 2000 || year > 2100) return 0;
        if (month < 1 || month > 12) return 0;
        if (day < 1 || day > 31) return 0;
        if (hour < 0 || hour > 23) return 0;
        if (minute < 0 || minute > 59) return 0;
        return new Date(year, month - 1, day, hour, minute, second || 0).getTime();
    } catch (e) { return 0; }
}

// ============================================
// LOAD CHART HISTORY (DEFAULT 24 DATA, TREN 7 HARI)
// ============================================
export async function loadChartHistory() {
    console.log('📊 loadChartHistory - GRAFIK 24 DATA, TREN 7 HARI (FIX)');
    
    localStorage.removeItem(CACHE_KEY);
    
    try {
        const snapshot = await get(ref(db, 'sensor_history'));
        const historyData = snapshot.val();

        if (!historyData) {
            console.log('⚠️ Tidak ada data history');
            applyChartData([]);
            return;
        }

        const keys = Object.keys(historyData).filter(key => key.includes('T')).sort();
        console.log(`📊 Total data di DB: ${keys.length}`);

        if (keys.length === 0) {
            applyChartData([]);
            return;
        }

        // ⭐ AMBIL 1 DATA PER JAM (MENIT = 0) UNTUK GRAFIK
        const hourlyKeys = keys.filter(key => {
            const parts = key.split('T');
            if (parts.length !== 2) return false;
            const timePart = parts[1].split('-');
            if (timePart.length < 2) return false;
            const minute = parseInt(timePart[1]);
            return minute === 0;
        });

        if (hourlyKeys.length === 0) {
            applyChartData([]);
            return;
        }

        // ⭐ AMBIL 24 DATA TERAKHIR UNTUK GRAFIK
        const last24Keys = hourlyKeys.slice(-24);
        console.log(`📊 Data untuk grafik: ${last24Keys.length} (24 jam terakhir)`);

        // ⭐ BUILD RAW DATA UNTUK GRAFIK (PAKE HOURLY KEYS)
        const chartData = last24Keys.map(key => {
            const entry = historyData[key];
            let suhu = 0, cahaya = 0, lampu = 0, kelembapan = 0;

            if (entry.suhu) {
                suhu = entry.suhu.value ?? entry.suhu ?? 0;
            }
            if (entry.cahaya) {
                cahaya = entry.cahaya.value ?? entry.cahaya ?? 0;
            }
            if (entry.lampu) {
                lampu = entry.lampu.state === true || entry.lampu.state === 1 || entry.lampu.state === 'ON' ? 1 : 0;
            }
            if (entry.kelembapan) {
                kelembapan = entry.kelembapan.value ?? entry.kelembapan ?? 0;
            }

            const timestamp = parseKeyToTimestamp(key);
            return { key, suhu: Number(suhu), cahaya: Number(cahaya), lampu, kelembapan: Number(kelembapan), timestamp };
        });

        // ⭐ BUILD DATA UNTUK TREN & HEATMAP (PAKE SEMUA DATA - GAK DI-FILTER)
        const trendData = keys.map(key => {
            const entry = historyData[key];
            let suhu = 0, cahaya = 0, lampu = 0, kelembapan = 0;

            if (entry.suhu) {
                suhu = entry.suhu.value ?? entry.suhu ?? 0;
            }
            if (entry.cahaya) {
                cahaya = entry.cahaya.value ?? entry.cahaya ?? 0;
            }
            if (entry.lampu) {
                lampu = entry.lampu.state === true || entry.lampu.state === 1 || entry.lampu.state === 'ON' ? 1 : 0;
            }
            if (entry.kelembapan) {
                kelembapan = entry.kelembapan.value ?? entry.kelembapan ?? 0;
            }

            const timestamp = parseKeyToTimestamp(key);
            return { key, suhu: Number(suhu), cahaya: Number(cahaya), lampu, kelembapan: Number(kelembapan), timestamp };
        });

        console.log(`📊 Data untuk tren: ${trendData.length} (semua data)`);

        // ⭐ APPLY: GRAFIK PAKE chartData, TREN & HEATMAP PAKE trendData
        applyChartData(chartData, trendData);
        console.log(`✅ Analytics chart loaded: ${chartData.length} data (grafik), ${trendData.length} data (tren)`);
    } catch (e) {
        console.error('❌ loadChartHistory error:', e);
        applyChartData([]);
    }
}

// ============================================
// LOAD CHART HISTORY BY DATE (GRAFIK 24 DATA, TREN 7 HARI + 1 DUMMY)
// ============================================
export async function loadChartHistoryByDate(dateStr) {
    console.log('📅 loadChartHistoryByDate (GRAFIK 24 DATA, TREN 7 HARI + 1 DUMMY):', dateStr);
    try {
        if (!dateStr) { 
            showToast('⚠️ Pilih tanggal dulu!', 'warning'); 
            return; 
        }
        
        // ⭐ BUAT FORMAT DENGAN LEADING ZERO
        const dateStrWithZero = dateStr.split('-').map((part, i) => i === 0 ? part : part.padStart(2, '0')).join('-');
        console.log('📅 Format dengan leading zero:', dateStrWithZero);
        
        const startDate = new Date(dateStrWithZero);
        startDate.setDate(startDate.getDate() - 6);
        const startStr = startDate.toISOString().slice(0, 10);
        
        const url = `https://growlightta-default-rtdb.asia-southeast1.firebasedatabase.app/sensor_history.json?orderBy="$key"&startAt="${startStr}T00"&endAt="${dateStrWithZero}T23"`;
        console.log('📡 Fetching URL:', url);
        
        const response = await fetch(url);
        const historyData = await response.json();
        
        if (!historyData || Object.keys(historyData).length === 0) {
            showToast(`⚠️ Tidak ada data untuk ${dateStr}`, 'warning');
            return;
        }

        // ⭐ FILTER: AMBIL 1 DATA PER JAM (MENIT = 0)
        const allKeys = Object.keys(historyData)
            .filter(key => {
                const parts = key.split('T');
                if (parts.length !== 2) return false;
                const timePart = parts[1].split('-');
                if (timePart.length < 2) return false;
                const minute = parseInt(timePart[1]);
                return minute === 0;
            })
            .sort();
        
        console.log(`📊 Total data: ${Object.keys(historyData).length}, setelah filter per jam: ${allKeys.length}`);

        if (allKeys.length === 0) {
            showToast(`⚠️ Tidak ada data per jam untuk rentang ini`, 'warning');
            return;
        }

        // ⭐ BUAT DATA UNTUK GRAFIK (HANYA TANGGAL YANG DIPILIH)
        const chartKeys = allKeys.filter(key => key.includes(dateStrWithZero));
        
        // ⭐ BUAT DATA UNTUK TREN & HEATMAP (SEMUA DATA 7 HARI)
        let trendKeys = allKeys;

        console.log(`📊 Data untuk grafik: ${chartKeys.length}, Data untuk tren: ${trendKeys.length}`);

        const processData = (keys) => {
            return keys.map(key => {
                const entry = historyData[key];
                let suhu = 0, cahaya = 0, lampu = 0, kelembapan = 0;

                if (entry.suhu) {
                    suhu = entry.suhu.value ?? entry.suhu ?? 0;
                } else {
                    for (const subKey of Object.keys(entry)) {
                        const subNode = entry[subKey];
                        if (subNode && typeof subNode === 'object' && subNode.value !== undefined) {
                            if (!suhu) suhu = parseFloat(subNode.value) || 0;
                            break;
                        }
                    }
                }
                if (entry.cahaya) cahaya = entry.cahaya.value ?? entry.cahaya ?? 0;
                if (entry.lampu) lampu = entry.lampu.state === true || entry.lampu.state === 1 || entry.lampu.state === 'ON' ? 1 : 0;
                if (entry.kelembapan) {
                    kelembapan = entry.kelembapan.value ?? entry.kelembapan ?? 0;
                } else {
                    for (const subKey of Object.keys(entry)) {
                        const subNode = entry[subKey];
                        if (subNode && typeof subNode === 'object' && subNode.value !== undefined) {
                            if (!kelembapan) kelembapan = parseFloat(subNode.value) || 0;
                            break;
                        }
                    }
                }

                const timestamp = parseKeyToTimestamp(key);
                return { key, suhu: Number(suhu), cahaya: Number(cahaya), lampu, kelembapan: Number(kelembapan), timestamp };
            });
        };

        let chartData = processData(chartKeys);
        let trendData = processData(trendKeys);

        // ⭐ TAMBAHIN 1 DATA DUMMY (HARI SETELAH TANGGAL YANG DIPILIH)
        const dummyDate = new Date(dateStrWithZero);
        dummyDate.setDate(dummyDate.getDate() + 1);
        const dummyKey = dummyDate.toISOString().slice(0, 10) + 'T00-00-00-000Z';
        const dummyData = {
            key: dummyKey,
            suhu: 0,
            kelembapan: 0,
            cahaya: 0,
            lampu: 0,
            timestamp: dummyDate.getTime()
        };
        trendData.push(dummyData);
        console.log('📊 Data dummy ditambahkan:', dummyKey);

        // ⭐ APPLY: GRAFIK PAKE chartData, TREN & HEATMAP PAKE trendData
        applyChartData(chartData, trendData);
        showToast(`✅ Menampilkan ${chartData.length} data untuk ${dateStr}`, 'success');
    } catch (e) {
        console.error('❌ loadChartHistoryByDate:', e);
        showToast('❌ Gagal load data: ' + e.message, 'error');
    }
}

// ============================================
// APPLY CHART DATA (GRAFIK PAKE chartData, TREN PAKE trendData)
// ============================================
export function applyChartData(chartData, trendData = null) {
    const dataForTrend = trendData || chartData;
    
    console.log(`📊 applyChartData: ${chartData?.length || 0} data (grafik), ${dataForTrend?.length || 0} data (tren)`);
    
    // ⭐ BRUTAL: HAPUS SEMUA CHART DARI DOM
    const charts = ['tempChart', 'lightChart', 'lampStatusChart', 'humidityChart'];
    charts.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const chart = Chart.getChart(canvas);
            if (chart) chart.destroy();
            const parent = canvas.parentNode;
            const newCanvas = document.createElement('canvas');
            newCanvas.id = id;
            parent.replaceChild(newCanvas, canvas);
        }
    });

    tempChart = null;
    lightChart = null;
    lampStatusChart = null;
    humidityChart = null;

    tempLabels.length = 0;
    tempData.length = 0;
    lightLabels.length = 0;
    sensorData.length = 0;

    if (!chartData || chartData.length === 0) {
        const placeholder = ['Belum Ada Data'];
        tempLabels.push(...placeholder);
        tempData.push(0);
        lightLabels.push(...placeholder);
        sensorData.push(0);
        initCharts();
        updateStats(dataForTrend);
        updateCategoryStats(dataForTrend);
        updateLampStats(dataForTrend);
        updateTrend(dataForTrend);
        updateHeatmap(dataForTrend);
        updateHistogram(dataForTrend);
        updateHumidityTrend(dataForTrend);
        updateHumidityHeatmap(dataForTrend);
        updateHumidityHistogram(dataForTrend);
        return;
    }

    const labels = chartData.map(d => new Date(d.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    chartData.forEach((d, i) => {
        tempLabels.push(labels[i] || `${i}`);
        tempData.push(d.suhu || 0);
        lightLabels.push(labels[i] || `${i}`);
        sensorData.push(Math.round(d.cahaya || 0));
    });

    initCharts();

    if (tempChart) {
        tempChart.data.labels = tempLabels;
        tempChart.data.datasets[0].data = tempData;
        tempChart.update();
    }
    if (lightChart) {
        lightChart.data.labels = lightLabels;
        lightChart.data.datasets[0].data = sensorData;
        lightChart.update();
    }
    if (lampStatusChart) {
        lampStatusChart.data.labels = labels;
        lampStatusChart.data.datasets[0].data = chartData.map(d => (d.lampu === true || d.lampu === 1) ? 1 : 0);
        lampStatusChart.update();
    }
    if (humidityChart) {
        humidityChart.data.labels = tempLabels;
        const humData = chartData.map(d => d.kelembapan || 0);
        humidityChart.data.datasets[0].data = humData;
        humidityChart.update();
        console.log('✅ humidityChart updated');
    }

    // ⭐ TREN, HEATMAP, HISTOGRAM PAKE dataForTrend (7 HARI + 1 DUMMY)
    updateStats(dataForTrend);
    updateCategoryStats(dataForTrend);
    updateLampStats(dataForTrend);
    updateTrend(dataForTrend);
    updateHeatmap(dataForTrend);
    updateHistogram(dataForTrend);
    updateHumidityTrend(dataForTrend);
    updateHumidityHeatmap(dataForTrend);
    updateHumidityHistogram(dataForTrend);
}

// ============================================
// STATS FUNCTIONS
// ============================================
function updateStats(data) {
    const temps = data.map(d => d.suhu).filter(v => v > 0);
    if (temps.length) {
        const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
        const avgEl = document.getElementById('avgTemp');
        const maxEl = document.getElementById('maxTemp');
        const minEl = document.getElementById('minTemp');
        if (avgEl) avgEl.textContent = avg.toFixed(1) + '°C';
        if (maxEl) maxEl.textContent = Math.max(...temps).toFixed(1) + '°C';
        if (minEl) minEl.textContent = Math.min(...temps).toFixed(1) + '°C';
    }
    const lights = data.map(d => d.cahaya).filter(v => v > 0);
    if (lights.length) {
        const avgL = lights.reduce((a, b) => a + b, 0) / lights.length;
        const avgEl = document.getElementById('avgLight');
        if (avgEl) avgEl.textContent = Math.round(avgL) + ' lux';
    }
}

function updateCategoryStats(data) {
    const values = data.map(d => d.suhu).filter(v => v > 0);
    if (!values.length) {
        ['cold', 'normal', 'warm', 'hot'].forEach(id => {
            const pct = document.getElementById(id + 'Percent');
            const bar = document.getElementById(id + 'Bar');
            if (pct) pct.textContent = '0%';
            if (bar) bar.style.width = '0%';
        });
        return;
    }
    const total = values.length;
    const calc = n => Math.round((n / total) * 100);
    const cold = values.filter(v => v < 25).length;
    const normal = values.filter(v => v >= 25 && v < 30).length;
    const warm = values.filter(v => v >= 30 && v < 34).length;
    const hot = values.filter(v => v >= 34).length;
    ['cold', 'normal', 'warm', 'hot'].forEach((id, i) => {
        const pct = [cold, normal, warm, hot][i];
        const elPct = document.getElementById(id + 'Percent');
        const elBar = document.getElementById(id + 'Bar');
        if (elPct) elPct.textContent = calc(pct) + '%';
        if (elBar) elBar.style.width = calc(pct) + '%';
    });
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

    const onTime = document.getElementById('lampOnTime');
    const offTime = document.getElementById('lampOffTime');
    const onPct = document.getElementById('onPercent');
    const offPct = document.getElementById('offPercent');
    const onBar = document.getElementById('lampOnBar');
    const offBar = document.getElementById('lampOffBar');
    if (onTime) onTime.textContent = totalOn.toFixed(1) + ' jam';
    if (offTime) offTime.textContent = totalOff.toFixed(1) + ' jam';
    if (onPct) onPct.textContent = `ON: ${onP}%`;
    if (offPct) offPct.textContent = `OFF: ${offP}%`;
    if (onBar) onBar.style.width = onP + '%';
    if (offBar) offBar.style.width = offP + '%';
}

// ============================================
// TREN 7 HARI (SUHU)
// ============================================
function updateTrend(data) {
    const container = document.getElementById('trendContainer');
    if (!container) return;
    
    const days = {};
    data.forEach(d => {
        const day = new Date(d.timestamp).toISOString().slice(0, 10);
        if (!days[day]) days[day] = [];
        days[day].push(d.suhu);
    });
    
    const sortedDays = Object.keys(days).sort().reverse();
    const last7Days = sortedDays.slice(0, 7).reverse();
    
    let html = '';
    last7Days.forEach(day => {
        const vals = days[day] || [];
        const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '--';
        const color = avg > 30 ? '#ef4444' : avg > 25 ? '#f59e0b' : avg > 20 ? '#22c55e' : '#3b82f6';
        html += `<div style="text-align:center;background:rgba(255,255,255,.04);padding:8px;border-radius:8px;">
            <div style="font-size:11px;color:var(--text-muted);">${day.slice(5)}</div>
            <div style="font-size:16px;font-weight:600;color:${color};">${avg}°</div>
        </div>`;
    });
    container.innerHTML = html;
}

// ============================================
// HEATMAP 7 HARI (SUHU) - SKIP DUMMY
// ============================================
function updateHeatmap(data) {
    const table = document.getElementById('heatmapTable');
    if (!table) return;
    
    const days = {};
    data.forEach(d => {
        // ⭐ SKIP DATA DUMMY (suhu = 0)
        if (d.suhu === 0 && d.kelembapan === 0 && d.cahaya === 0) return;
        
        const keyParts = d.key.split('T');
        if (keyParts.length !== 2) return;
        const dateStr = keyParts[0];
        const timeParts = keyParts[1].split('-');
        if (timeParts.length < 2) return;
        const hour = parseInt(timeParts[0]);
        
        if (!days[dateStr]) days[dateStr] = [];
        days[dateStr].push({ hour: hour, suhu: d.suhu });
    });
    
    const sortedDays = Object.keys(days).sort();
    const last7Days = sortedDays.slice(-7);
    
    const ranges = [0, 6, 12, 18, 24];
    let html = '<thead><tr><th></th>';
    for (let i = 0; i < 4; i++) html += `<th style="font-size:10px;color:var(--text-muted);">${ranges[i]}-${ranges[i+1]}</th>`;
    html += '</tr></thead><tbody>';
    
    last7Days.forEach(day => {
        html += `<tr><td style="font-size:11px;color:var(--text-muted);">${day.slice(5)}</td>`;
        for (let i = 0; i < 4; i++) {
            const vals = (days[day] || [])
                .filter(d => d.hour >= ranges[i] && d.hour < ranges[i + 1])
                .map(d => d.suhu)
                .filter(v => v > 0);
            const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '-';
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

// ============================================
// HISTOGRAM (SUHU)
// ============================================
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

// ============================================
// TREN KELEMBAPAN 7 HARI
// ============================================
function updateHumidityTrend(data) {
    const container = document.getElementById('humidityTrendContainer');
    if (!container) return;
    
    const days = {};
    data.forEach(d => {
        const day = new Date(d.timestamp).toISOString().slice(0, 10);
        if (!days[day]) days[day] = [];
        days[day].push(d.kelembapan || 0);
    });
    
    const sortedDays = Object.keys(days).sort().reverse();
    const last7Days = sortedDays.slice(0, 7).reverse();
    
    let html = '';
    last7Days.forEach(day => {
        const vals = days[day] || [];
        const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '--';
        const color = avg > 80 ? '#3b82f6' : avg > 70 ? '#60a5fa' : avg > 60 ? '#94a3b8' : '#64748b';
        html += `<div style="text-align:center;background:rgba(255,255,255,.04);padding:8px;border-radius:8px;">
            <div style="font-size:11px;color:var(--text-muted);">${day.slice(5)}</div>
            <div style="font-size:16px;font-weight:600;color:${color};">${avg}%</div>
        </div>`;
    });
    container.innerHTML = html;
}

// ============================================
// HEATMAP KELEMBAPAN 7 HARI - SKIP DUMMY
// ============================================
function updateHumidityHeatmap(data) {
    const table = document.getElementById('humidityHeatmapTable');
    if (!table) return;
    
    const days = {};
    data.forEach(d => {
        // ⭐ SKIP DATA DUMMY (kelembapan = 0)
        if (d.suhu === 0 && d.kelembapan === 0 && d.cahaya === 0) return;
        
        const keyParts = d.key.split('T');
        if (keyParts.length !== 2) return;
        const dateStr = keyParts[0];
        const timeParts = keyParts[1].split('-');
        if (timeParts.length < 2) return;
        const hour = parseInt(timeParts[0]);
        
        if (!days[dateStr]) days[dateStr] = [];
        days[dateStr].push({ hour: hour, kelembapan: d.kelembapan || 0 });
    });
    
    const sortedDays = Object.keys(days).sort();
    const last7Days = sortedDays.slice(-7);
    
    const ranges = [0, 6, 12, 18, 24];
    let html = '<thead><tr><th></th>';
    for (let i = 0; i < 4; i++) html += `<th style="font-size:10px;color:var(--text-muted);">${ranges[i]}-${ranges[i+1]}</th>`;
    html += '</tr></thead><tbody>';
    
    last7Days.forEach(day => {
        html += `<tr><td style="font-size:11px;color:var(--text-muted);">${day.slice(5)}</td>`;
        for (let i = 0; i < 4; i++) {
            const vals = (days[day] || [])
                .filter(d => d.hour >= ranges[i] && d.hour < ranges[i + 1])
                .map(d => d.kelembapan)
                .filter(v => v > 0);
            const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '-';
            let bg = 'rgba(100,116,139,0.2)', tc = '#94a3b8';
            if (avg !== '-') {
                if (avg > 80) { bg = 'rgba(59,130,246,0.4)'; tc = '#3b82f6'; }
                else if (avg > 70) { bg = 'rgba(96,165,250,0.4)'; tc = '#60a5fa'; }
                else if (avg > 60) { bg = 'rgba(148,163,184,0.3)'; tc = '#94a3b8'; }
                else { bg = 'rgba(100,116,139,0.2)'; tc = '#64748b'; }
            }
            html += `<td style="background:${bg};text-align:center;padding:6px;border-radius:4px;font-size:12px;color:${tc};">${avg}</td>`;
        }
        html += '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
}

// ============================================
// HISTOGRAM KELEMBAPAN
// ============================================
function updateHumidityHistogram(data) {
    const canvas = document.getElementById('humidityHistogramChart');
    if (!canvas) return;
    const values = data.map(d => d.kelembapan || 0).filter(v => v > 0);
    let chart = Chart.getChart(canvas);
    if (chart) chart.destroy();
    if (!values.length) {
        new Chart(canvas, {
            type: 'bar',
            data: { labels: ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100'], datasets: [{ data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], backgroundColor: '#64748b' }] },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
        return;
    }
    const bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const labels = ['0-10%', '10-20%', '20-30%', '30-40%', '40-50%', '50-60%', '60-70%', '70-80%', '80-90%', '90-100%'];
    const counts = bins.map((b, i) => {
        const next = bins[i + 1] || Infinity;
        return values.filter(v => v >= b && v < next).length;
    });
    new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ data: counts, backgroundColor: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#94a3b8', '#94a3b8', '#94a3b8', '#60a5fa', '#3b82f6', '#1d4ed8'] }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
}

// ============================================
// 📥 EXPORT FULL REPORT PER TANGGAL (REVISI)
// ============================================
export async function exportFullReport(dateStr) {
    console.log('📥 exportFullReport:', dateStr);
    
    try {
        // FORMAT TANGGAL DENGAN LEADING ZERO
        const dateStrWithZero = dateStr.split('-').map((part, i) => i === 0 ? part : part.padStart(2, '0')).join('-');
        
        const url = `https://growlightta-default-rtdb.asia-southeast1.firebasedatabase.app/sensor_history.json?orderBy="$key"&startAt="${dateStrWithZero}T00"&endAt="${dateStrWithZero}T23"`;
        const response = await fetch(url);
        const historyData = await response.json();
        
        if (!historyData || Object.keys(historyData).length === 0) {
            showToast(`⚠️ Tidak ada data untuk ${dateStr}`, 'warning');
            return;
        }
        
        // FILTER 1 DATA PER JAM (MENIT = 0)
        const keys = Object.keys(historyData)
            .filter(key => {
                const parts = key.split('T');
                if (parts.length !== 2) return false;
                const timePart = parts[1].split('-');
                if (timePart.length < 2) return false;
                const minute = parseInt(timePart[1]);
                return minute === 0;
            })
            .sort();
        
        if (keys.length === 0) {
            showToast(`⚠️ Tidak ada data per jam untuk ${dateStr}`, 'warning');
            return;
        }
        
        // PROSES DATA
        const rawData = keys.map(key => {
            const entry = historyData[key];
            let suhu = 0, cahaya = 0, lampu = 0, kelembapan = 0;
            
            if (entry.suhu) suhu = entry.suhu.value ?? entry.suhu ?? 0;
            if (entry.cahaya) cahaya = entry.cahaya.value ?? entry.cahaya ?? 0;
            if (entry.lampu) lampu = entry.lampu.state === true || entry.lampu.state === 1 || entry.lampu.state === 'ON' ? 1 : 0;
            if (entry.kelembapan) kelembapan = entry.kelembapan.value ?? entry.kelembapan ?? 0;
            
            const timestamp = parseKeyToTimestamp(key);
            return { key, suhu: Number(suhu), cahaya: Number(cahaya), lampu, kelembapan: Number(kelembapan), timestamp };
        });
        
        // STATISTIK
        const suhuValues = rawData.map(d => d.suhu).filter(v => v > 0);
        const humValues = rawData.map(d => d.kelembapan).filter(v => v > 0);
        const lightValues = rawData.map(d => d.cahaya).filter(v => v > 0);
        const lampOnCount = rawData.filter(d => d.lampu === 1).length;
        const lampOffCount = rawData.filter(d => d.lampu === 0).length;
        
        const stats = {
            avgSuhu: suhuValues.length ? (suhuValues.reduce((a, b) => a + b, 0) / suhuValues.length).toFixed(1) : '--',
            maxSuhu: suhuValues.length ? Math.max(...suhuValues).toFixed(1) : '--',
            minSuhu: suhuValues.length ? Math.min(...suhuValues).toFixed(1) : '--',
            avgHum: humValues.length ? (humValues.reduce((a, b) => a + b, 0) / humValues.length).toFixed(1) : '--',
            maxHum: humValues.length ? Math.max(...humValues).toFixed(1) : '--',
            minHum: humValues.length ? Math.min(...humValues).toFixed(1) : '--',
            avgLight: lightValues.length ? Math.round(lightValues.reduce((a, b) => a + b, 0) / lightValues.length) : '--',
            maxLight: lightValues.length ? Math.max(...lightValues) : '--',
            minLight: lightValues.length ? Math.min(...lightValues) : '--',
            totalOn: lampOnCount,
            totalOff: lampOffCount,
            totalData: rawData.length,
            onPercent: rawData.length ? Math.round((lampOnCount / rawData.length) * 100) : 0,
            offPercent: rawData.length ? Math.round((lampOffCount / rawData.length) * 100) : 0,
        };
        
        // HISTOGRAM SUHU
        const suhuBins = [0, 10, 20, 25, 30, 35, 40];
        const suhuLabels = ['0-10°C', '10-20°C', '20-25°C', '25-30°C', '30-35°C', '35-40°C', '40+°C'];
        const suhuCounts = suhuBins.map((b, i) => {
            const next = suhuBins[i + 1] || Infinity;
            return suhuValues.filter(v => v >= b && v < next).length;
        });
        
        // HISTOGRAM KELEMBAPAN
        const humBins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        const humLabels = ['0-10%', '10-20%', '20-30%', '30-40%', '40-50%', '50-60%', '60-70%', '70-80%', '80-90%', '90-100%'];
        const humCounts = humBins.map((b, i) => {
            const next = humBins[i + 1] || Infinity;
            return humValues.filter(v => v >= b && v < next).length;
        });
        
        // DATA UNTUK CHART
        const labels = rawData.map(d => new Date(d.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
        const suhuData = rawData.map(d => d.suhu);
        const humData = rawData.map(d => d.kelembapan);
        const lightData = rawData.map(d => d.cahaya);
        const lampData = rawData.map(d => d.lampu);
        
        // ============================================================
        // 📄 GENERATE HTML LAPORAN
        // ============================================================
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Laporan Sensor ${dateStr}</title>
            <style>
                * { box-sizing: border-box; }
                body { 
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    background: #0b0f1a; 
                    color: #f1f5f9; 
                    padding: 20px; 
                    margin: 0;
                }
                .container { max-width: 1200px; margin: 0 auto; }
                
                .report-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 2px solid rgba(34,197,94,0.3);
                    padding-bottom: 16px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                .report-header h1 {
                    color: #22c55e;
                    font-size: 24px;
                    margin: 0;
                }
                .report-header .sub {
                    color: #94a3b8;
                    font-size: 13px;
                }
                .report-header .date-badge {
                    background: rgba(34,197,94,0.15);
                    padding: 6px 16px;
                    border-radius: 20px;
                    border: 1px solid rgba(34,197,94,0.3);
                    font-size: 14px;
                    color: #22c55e;
                }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: 10px;
                    margin: 16px 0;
                }
                .stat-card {
                    background: #111827;
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 10px;
                    padding: 12px 14px;
                    text-align: center;
                }
                .stat-card .label {
                    font-size: 10px;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .stat-card .value {
                    font-size: 20px;
                    font-weight: 700;
                    margin-top: 2px;
                }
                .stat-card .value.green { color: #22c55e; }
                .stat-card .value.red { color: #ef4444; }
                .stat-card .value.blue { color: #3b82f6; }
                .stat-card .value.yellow { color: #f59e0b; }
                .stat-card .value.purple { color: #8b5cf6; }
                
                .chart-container {
                    background: #111827;
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 10px;
                    padding: 16px;
                    margin: 12px 0;
                }
                .chart-container h3 {
                    margin: 0 0 8px 0;
                    font-size: 14px;
                    color: #e2e8f0;
                }
                .chart-container canvas {
                    width: 100% !important;
                    height: 200px !important;
                }
                
                .histogram-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    margin: 12px 0;
                }
                .histogram-card {
                    background: #111827;
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 10px;
                    padding: 14px 16px;
                }
                .histogram-card h3 {
                    font-size: 12px;
                    margin: 0 0 8px 0;
                    color: #e2e8f0;
                }
                .bar-container {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin: 2px 0;
                }
                .bar-label {
                    font-size: 9px;
                    color: #94a3b8;
                    width: 45px;
                    text-align: right;
                    flex-shrink: 0;
                }
                .bar-track {
                    flex: 1;
                    height: 14px;
                    background: rgba(255,255,255,0.06);
                    border-radius: 4px;
                    overflow: hidden;
                }
                .bar-fill {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.3s;
                }
                .bar-value {
                    font-size: 9px;
                    color: #94a3b8;
                    width: 25px;
                    text-align: right;
                    flex-shrink: 0;
                }
                
                .lamp-stats {
                    display: flex;
                    gap: 20px;
                    justify-content: center;
                    flex-wrap: wrap;
                    margin: 8px 0;
                }
                .lamp-stats span {
                    font-size: 13px;
                }
                .lamp-bar {
                    display: flex;
                    height: 16px;
                    border-radius: 8px;
                    overflow: hidden;
                    margin-top: 6px;
                }
                .lamp-bar .on { background: #22c55e; }
                .lamp-bar .off { background: #ef4444; }
                
                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                    margin-top: 8px;
                }
                .data-table th {
                    background: rgba(255,255,255,0.05);
                    padding: 6px 8px;
                    text-align: left;
                    color: #94a3b8;
                    font-weight: 500;
                }
                .data-table td {
                    padding: 4px 8px;
                    border-bottom: 1px solid rgba(255,255,255,0.04);
                }
                .data-table tr:hover {
                    background: rgba(255,255,255,0.02);
                }
                .data-table .on { color: #22c55e; }
                .data-table .off { color: #ef4444; }
                
                .footer {
                    margin-top: 20px;
                    font-size: 11px;
                    color: #64748b;
                    text-align: center;
                    border-top: 1px solid rgba(255,255,255,0.06);
                    padding-top: 12px;
                }
                
                @media (max-width: 768px) {
                    .stats-grid { grid-template-columns: 1fr 1fr; }
                    .histogram-grid { grid-template-columns: 1fr; }
                    .report-header { flex-direction: column; text-align: center; }
                }
                @media print {
                    body { background: white; color: #1e293b; }
                    .stat-card, .chart-container, .histogram-card { background: #f8fafc; border-color: #e2e8f0; }
                    .stat-card .label { color: #64748b; }
                    .chart-container h3 { color: #1e293b; }
                }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        </head>
        <body>
            <div class="container" id="reportContainer">
                
                <!-- HEADER -->
                <div class="report-header">
                    <div>
                        <h1>📊 Laporan Sensor</h1>
                        <div class="sub">SIGMA Grow Light Monitoring System</div>
                    </div>
                    <div class="date-badge">📅 ${dateStr}</div>
                </div>
                
                <!-- STATISTIK -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="label">🌡️ Rata Suhu</div>
                        <div class="value green">${stats.avgSuhu}°C</div>
                    </div>
                    <div class="stat-card">
                        <div class="label">📈 Suhu Max</div>
                        <div class="value red">${stats.maxSuhu}°C</div>
                    </div>
                    <div class="stat-card">
                        <div class="label">📉 Suhu Min</div>
                        <div class="value blue">${stats.minSuhu}°C</div>
                    </div>
                    <div class="stat-card">
                        <div class="label">💧 Rata Kelembapan</div>
                        <div class="value blue">${stats.avgHum}%</div>
                    </div>
                    <div class="stat-card">
                        <div class="label">💡 Rata Cahaya</div>
                        <div class="value yellow">${stats.avgLight} lux</div>
                    </div>
                    <div class="stat-card">
                        <div class="label">📊 Total Data</div>
                        <div class="value purple">${stats.totalData} titik</div>
                    </div>
                </div>
                
                <!-- LAMPU STATS -->
                <div class="stat-card" style="margin-bottom:12px;">
                    <div class="label">💡 Status Lampu</div>
                    <div class="lamp-stats">
                        <span class="green">ON: ${stats.totalOn} jam (${stats.onPercent}%)</span>
                        <span class="red">OFF: ${stats.totalOff} jam (${stats.offPercent}%)</span>
                    </div>
                    <div class="lamp-bar">
                        <div class="on" style="width:${stats.onPercent}%;"></div>
                        <div class="off" style="width:${stats.offPercent}%;"></div>
                    </div>
                </div>
                
                <!-- CHART: SUHU -->
                <div class="chart-container">
                    <h3>🌡️ Suhu</h3>
                    <canvas id="chartSuhu"></canvas>
                </div>
                
                <!-- CHART: KELEMBAPAN -->
                <div class="chart-container">
                    <h3>💧 Kelembapan</h3>
                    <canvas id="chartHum"></canvas>
                </div>
                
                <!-- CHART: CAHAYA -->
                <div class="chart-container">
                    <h3>💡 Intensitas Cahaya</h3>
                    <canvas id="chartLight"></canvas>
                </div>
                
                <!-- CHART: STATUS LAMPU -->
                <div class="chart-container">
                    <h3>💡 Status Lampu</h3>
                    <canvas id="chartLamp"></canvas>
                </div>
                
                <!-- HISTOGRAM -->
                <div class="histogram-grid">
                    <div class="histogram-card">
                        <h3>📊 Histogram Suhu</h3>
                        ${suhuLabels.map((label, i) => `
                            <div class="bar-container">
                                <span class="bar-label">${label}</span>
                                <div class="bar-track">
                                    <div class="bar-fill" style="width:${Math.max(1, (suhuCounts[i] / Math.max(...suhuCounts, 1)) * 100)}%; background:${i < 2 ? '#3b82f6' : i < 4 ? '#22c55e' : i < 6 ? '#f59e0b' : '#ef4444'};"></div>
                                </div>
                                <span class="bar-value">${suhuCounts[i]}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="histogram-card">
                        <h3>📊 Histogram Kelembapan</h3>
                        ${humLabels.map((label, i) => `
                            <div class="bar-container">
                                <span class="bar-label">${label}</span>
                                <div class="bar-track">
                                    <div class="bar-fill" style="width:${Math.max(1, (humCounts[i] / Math.max(...humCounts, 1)) * 100)}%; background:${i < 3 ? '#3b82f6' : i < 6 ? '#22c55e' : i < 8 ? '#f59e0b' : '#ef4444'};"></div>
                                </div>
                                <span class="bar-value">${humCounts[i]}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <!-- DATA TABLE -->
                <div class="chart-container">
                    <h3>📋 Data Per Jam</h3>
                    <div style="overflow-x:auto; max-height:300px; overflow-y:auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Jam</th>
                                    <th>🌡️ Suhu</th>
                                    <th>💧 Kelembapan</th>
                                    <th>💡 Cahaya</th>
                                    <th>💡 Lampu</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rawData.map((d, i) => `
                                    <tr>
                                        <td>${labels[i]}</td>
                                        <td>${d.suhu.toFixed(1)}°C</td>
                                        <td>${d.kelembapan.toFixed(1)}%</td>
                                        <td>${Math.round(d.cahaya)} lux</td>
                                        <td class="${d.lampu === 1 ? 'on' : 'off'}">${d.lampu === 1 ? 'ON' : 'OFF'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="footer">
                    SIGMA Grow Light — Laporan otomatis dari sistem monitoring<br>
                    Generated: ${new Date().toLocaleString('id-ID')}
                </div>
            </div>
            
            <script>
                // RENDER CHART.JS
                const labels = ${JSON.stringify(labels)};
                const suhuData = ${JSON.stringify(suhuData)};
                const humData = ${JSON.stringify(humData)};
                const lightData = ${JSON.stringify(lightData)};
                const lampData = ${JSON.stringify(lampData)};
                
                function renderChart(id, label, data, color, isBar = false) {
                    const ctx = document.getElementById(id);
                    if (!ctx) return;
                    new Chart(ctx, {
                        type: isBar ? 'bar' : 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: label,
                                data: data,
                                borderColor: color,
                                backgroundColor: color + '33',
                                borderWidth: 2,
                                fill: true,
                                tension: 0.3,
                                pointRadius: 3,
                                pointBackgroundColor: color,
                                barPercentage: 0.6
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            plugins: {
                                legend: { labels: { color: '#cbd5e1', font: { size: 10 } } }
                            },
                            scales: {
                                x: { ticks: { color: '#94a3b8', maxTicksLimit: 12, font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                                y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
                            }
                        }
                    });
                }
                
                renderChart('chartSuhu', 'Suhu (°C)', suhuData, '#22c55e');
                renderChart('chartHum', 'Kelembapan (%)', humData, '#3b82f6');
                renderChart('chartLight', 'Cahaya (lux)', lightData, '#f59e0b');
                
                // LAMP CHART (BAR)
                const lampCtx = document.getElementById('chartLamp');
                if (lampCtx) {
                    new Chart(lampCtx, {
                        type: 'bar',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'Status Lampu',
                                data: lampData,
                                backgroundColor: lampData.map(v => v === 1 ? '#22c55e' : '#ef4444'),
                                borderWidth: 1,
                                borderRadius: 4,
                                barPercentage: 0.5
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            plugins: {
                                legend: { labels: { color: '#cbd5e1', font: { size: 10 } } },
                                tooltip: { callbacks: { label: (ctx) => ctx.parsed.y === 1 ? 'ON' : 'OFF' } }
                            },
                            scales: {
                                x: { ticks: { color: '#94a3b8', maxTicksLimit: 12, font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                                y: { ticks: { color: '#94a3b8', stepSize: 1, callback: (v) => v === 1 ? 'ON' : 'OFF', font: { size: 9 } }, min: -0.5, max: 1.5, grid: { color: 'rgba(255,255,255,0.05)' } }
                            }
                        }
                    });
                }
            </script>
        </body>
        </html>
        `;
        
        // ============================================================
        // 📥 SAVE AS PDF atau BUKA DI WINDOW BARU
        // ============================================================
        const win = window.open('', '_blank');
        if (win) {
            win.document.write(html);
            win.document.close();
            showToast(`✅ Laporan ${dateStr} siap!`, 'success');
            
            // Auto print/save as PDF setelah load
            setTimeout(() => {
                win.print();
            }, 1500);
        } else {
            showToast('⚠️ Popup diblokir. Izinkan popup untuk melihat laporan.', 'warning');
        }
        
    } catch (e) {
        console.error('❌ exportFullReport error:', e);
        showToast('❌ Gagal export: ' + e.message, 'error');
        throw e;
    }
}

// ============================================
// 📥 EXPORT CSV (DATA MENTAH PER TANGGAL)
// ============================================
export async function exportCsvData(dateStr) {
    console.log('📥 exportCsvData:', dateStr);
    
    try {
        const dateStrWithZero = dateStr.split('-').map((part, i) => i === 0 ? part : part.padStart(2, '0')).join('-');
        
        const url = `https://growlightta-default-rtdb.asia-southeast1.firebasedatabase.app/sensor_history.json?orderBy="$key"&startAt="${dateStrWithZero}T00"&endAt="${dateStrWithZero}T23"`;
        const response = await fetch(url);
        const historyData = await response.json();
        
        if (!historyData || Object.keys(historyData).length === 0) {
            showToast(`⚠️ Tidak ada data untuk ${dateStr}`, 'warning');
            return;
        }
        
        const keys = Object.keys(historyData)
            .filter(key => {
                const parts = key.split('T');
                if (parts.length !== 2) return false;
                const timePart = parts[1].split('-');
                if (timePart.length < 2) return false;
                const minute = parseInt(timePart[1]);
                return minute === 0;
            })
            .sort();
        
        if (keys.length === 0) {
            showToast(`⚠️ Tidak ada data per jam untuk ${dateStr}`, 'warning');
            return;
        }
        
        // Build CSV
        let csv = 'Jam,Suhu (°C),Kelembapan (%),Cahaya (lux),Status Lampu\n';
        
        keys.forEach(key => {
            const entry = historyData[key];
            let suhu = 0, cahaya = 0, lampu = 0, kelembapan = 0;
            
            if (entry.suhu) suhu = entry.suhu.value ?? entry.suhu ?? 0;
            if (entry.cahaya) cahaya = entry.cahaya.value ?? entry.cahaya ?? 0;
            if (entry.lampu) lampu = entry.lampu.state === true || entry.lampu.state === 1 || entry.lampu.state === 'ON' ? 1 : 0;
            if (entry.kelembapan) kelembapan = entry.kelembapan.value ?? entry.kelembapan ?? 0;
            
            const timestamp = parseKeyToTimestamp(key);
            const time = new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            
            csv += `${time},${Number(suhu).toFixed(1)},${Number(kelembapan).toFixed(1)},${Math.round(Number(cahaya))},${lampu === 1 ? 'ON' : 'OFF'}\n`;
        });
        
        // Download
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url2 = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url2;
        a.download = `sensor_data_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url2);
        
        showToast(`✅ CSV ${dateStr} berhasil diunduh! (${keys.length} data)`, 'success');
        
    } catch (e) {
        console.error('❌ exportCsvData error:', e);
        showToast('❌ Gagal export CSV: ' + e.message, 'error');
    }
}

// ============================================
// EXPOSE KE GLOBAL WINDOW
// ============================================
window.exportFullReport = exportFullReport;
window.exportCsvData = exportCsvData;

console.log('✅ analytics.js loaded (FIX HEATMAP + EXPORT)');
