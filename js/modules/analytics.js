// ============================================
// ANALYTICS: FULL CODE (WITH EVENT LISTENERS)
// ============================================

import { db } from '../firebase.js';
import { state, DOM, showToast, formatTime } from './core.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

console.log('📊 analytics.js loaded (WITH EVENT LISTENERS)');

const MAX_POINTS = 96;
const CACHE_KEY = 'analytics_24h_cache_hemat';

export const tempLabels = [], tempData = [], lightLabels = [], sensorData = [];
export let tempChart = null, lightChart = null, lampStatusChart = null;
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

    const tEl = document.getElementById('tempChart');
    if (tEl) {
        const existing = Chart.getChart(tEl);
        if (existing) existing.destroy();
        tempChart = new Chart(tEl, {
            type: 'line',
            data: {
                labels: tempLabels.length > 0 ? tempLabels : ['Belum Ada Data'],
                datasets: [{ label: 'Temperature (°C)', data: tempData.length > 0 ? tempData : [0], borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.2)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: isMobile ? 2 : 4, pointBackgroundColor: '#22c55e' }]
            },
            options: opts
        });
    }

    const lEl = document.getElementById('lightChart');
    if (lEl) {
        const existing = Chart.getChart(lEl);
        if (existing) existing.destroy();
        lightChart = new Chart(lEl, {
            type: 'line',
            data: {
                labels: lightLabels.length > 0 ? lightLabels : ['Belum Ada Data'],
                datasets: [{ label: 'Sensor Light (lux)', data: sensorData.length > 0 ? sensorData : [0], borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.2)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: isMobile ? 2 : 4, pointBackgroundColor: '#38bdf8' }]
            },
            options: opts
        });
    }

    const lsEl = document.getElementById('lampStatusChart');
    if (lsEl) {
        const existing = Chart.getChart(lsEl);
        if (existing) existing.destroy();
        lampStatusChart = new Chart(lsEl, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Status Lampu', data: [], backgroundColor: (ctx) => ctx.dataset.data[ctx.dataIndex] === 1 ? '#22c55e' : '#ef4444', borderWidth: 1, borderRadius: 4, barPercentage: isMobile ? 0.6 : 0.8 }] },
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

    const dEl = document.getElementById('dashTempChart');
    if (dEl) {
        const existing = Chart.getChart(dEl);
        if (existing) existing.destroy();
        dashTempChart = new Chart(dEl, {
            type: 'line',
            data: { labels: dashTempLabels.length > 0 ? dashTempLabels : ['-'], datasets: [{ label: 'Suhu (°C)', data: dashTempData.length > 0 ? dashTempData : [0], borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: isMobile ? 2 : 3 }] },
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

    if (tempChart && tempChart.data) {
        tempLabels.push(time);
        tempData.push(temp);
        if (tempLabels.length > MAX_POINTS) { tempLabels.shift(); tempData.shift(); }
        tempChart.update('none');
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
// LOAD CHART HISTORY (DEFAULT 24 DATA TERAKHIR)
// ============================================
export async function loadChartHistory() {
    console.log('📊 loadChartHistory - DEFAULT 24 DATA TERAKHIR');
    
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

        // ⭐ AMBIL 24 DATA TERAKHIR
        const last24Keys = keys.slice(-24);
        const rawData = [];

        last24Keys.forEach(key => {
            const entry = historyData[key];
            let suhu = 0, cahaya = 0, lampu = 0;

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

            if (entry.cahaya) {
                cahaya = entry.cahaya.value ?? entry.cahaya ?? 0;
            }

            if (entry.lampu) {
                lampu = entry.lampu.state === true || entry.lampu.state === 1 || entry.lampu.state === 'ON' ? 1 : 0;
            }

            const timestamp = parseKeyToTimestamp(key);
            if (timestamp > 0) {
                rawData.push({ key, suhu: Number(suhu), cahaya: Number(cahaya), lampu, timestamp });
            }
        });

        const validData = rawData.filter(d => d.timestamp > 0 && d.suhu > 0);
        console.log(`📊 Data valid: ${validData.length}`);

        if (validData.length === 0) {
            applyChartData([]);
            return;
        }

        applyChartData(validData);
        console.log(`✅ Analytics chart loaded: ${validData.length} data (24 jam terakhir)`);
    } catch (e) {
        console.error('❌ loadChartHistory error:', e);
        applyChartData([]);
    }
}

// ============================================
// LOAD CHART HISTORY BY DATE (BRUTAL METHOD)
// ============================================
export async function loadChartHistoryByDate(dateStr) {
    console.log('📅 loadChartHistoryByDate (BRUTAL):', dateStr);
    try {
        if (!dateStr) { showToast('⚠️ Pilih tanggal dulu!', 'warning'); return; }
        const snapshot = await get(ref(db, 'sensor_history'));
        const historyData = snapshot.val();
        if (!historyData) {
            showToast(`⚠️ Tidak ada data untuk ${dateStr}`, 'warning');
            return;
        }

        // Filter data berdasarkan tanggal
        const keys = Object.keys(historyData).filter(key => key.includes('T') && key.includes(dateStr)).sort();
        
        if (keys.length === 0) {
            showToast(`⚠️ Tidak ada data untuk ${dateStr}`, 'warning');
            return;
        }

        // ⭐ AMBIL SEMUA DATA DI TANGGAL TERSEBUT
        const rawData = keys.map(key => {
            const entry = historyData[key];
            let suhu = 0, cahaya = 0, lampu = 0;

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

            const timestamp = parseKeyToTimestamp(key);
            return { key, suhu: Number(suhu), cahaya: Number(cahaya), lampu, timestamp };
        });

        // ⭐ APPLY DATA BARU (BRUTAL METHOD)
        applyChartData(rawData);
        showToast(`✅ Menampilkan ${rawData.length} data untuk ${dateStr}`, 'success');
    } catch (e) {
        console.error('❌ loadChartHistoryByDate:', e);
        showToast('❌ Gagal load data: ' + e.message, 'error');
    }
}

// ============================================
// APPLY CHART DATA (BRUTAL METHOD - NO RELOAD)
// ============================================
export function applyChartData(hourlyData) {
    console.log(`📊 applyChartData (BRUTAL): ${hourlyData?.length || 0} data`);
    
    // ⭐ BRUTAL: HAPUS SEMUA CHART DARI DOM
    const charts = ['tempChart', 'lightChart', 'lampStatusChart'];
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

    // ⭐ RESET GLOBAL CHART VARIABLES
    tempChart = null;
    lightChart = null;
    lampStatusChart = null;

    // ⭐ RESET ARRAYS
    tempLabels.length = 0;
    tempData.length = 0;
    lightLabels.length = 0;
    sensorData.length = 0;

    if (!hourlyData || hourlyData.length === 0) {
        const placeholder = ['Belum Ada Data'];
        tempLabels.push(...placeholder);
        tempData.push(0);
        lightLabels.push(...placeholder);
        sensorData.push(0);
        initCharts();
        updateStats(hourlyData);
        updateCategoryStats(hourlyData);
        updateLampStats(hourlyData);
        updateTrend(hourlyData);
        updateHeatmap(hourlyData);
        updateHistogram(hourlyData);
        return;
    }

    const labels = hourlyData.map(d => new Date(d.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    hourlyData.forEach((d, i) => {
        tempLabels.push(labels[i] || `${i}`);
        tempData.push(d.suhu || 0);
        lightLabels.push(labels[i] || `${i}`);
        sensorData.push(Math.round(d.cahaya || 0));
    });

    // ⭐ RE-INIT CHARTS
    initCharts();

    // ⭐ FORCE UPDATE
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
        lampStatusChart.data.datasets[0].data = hourlyData.map(d => (d.lampu === true || d.lampu === 1) ? 1 : 0);
        lampStatusChart.update();
    }

    updateStats(hourlyData);
    updateCategoryStats(hourlyData);
    updateLampStats(hourlyData);
    updateTrend(hourlyData);
    updateHeatmap(hourlyData);
    updateHistogram(hourlyData);
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
// TREN 7 HARI
// ============================================
function updateTrend(data) {
    const container = document.getElementById('trendContainer');
    if (!container) return;
    
    const days = {};
    data.forEach(d => {
        const day = new Date(d.timestamp).