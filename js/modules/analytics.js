// ============================================
// ANALYTICS: BRUTAL METHOD (NO RELOAD)
// ============================================

import { db } from '../firebase.js';
import { state, DOM, showToast, formatTime } from './core.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

console.log('📊 analytics.js loaded (BRUTAL METHOD)');

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
// LOAD DASHBOARD CHART HISTORY
// ============================================
export async function loadDashChartHistory() {
    try {
        console.log('📊 loadDashChartHistory');
        let chart = dashTempChart;
        const canvas = document.getElementById('dashTempChart');
        if (!canvas) { console.warn('⚠️ Canvas not found'); return; }

        if (!chart) {
            const existing = Chart.getChart(canvas);
            if (existing) existing.destroy();
            const ctx = canvas.getContext('2d');
            chart = new Chart(ctx, {
                type: 'line',
                data: { labels: ['-'], datasets: [{ label: 'Suhu (°C)', data: [0], borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 }] },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { x: { display: true, ticks: { color: '#94a3b8', maxTicksLimit: 5 } }, y: { display: true, ticks: { color: '#94a3b8' } } } }
            });
            dashTempChart = chart;
        }

        if (!chart || !chart.data || !chart.data.datasets) return;

        const snapshot = await get(ref(db, 'sensor_history'));
        const historyData = snapshot.val();

        let labels = [], values = [];

        if (historyData) {
            const keys = Object.keys(historyData).filter(key => key.includes('T')).sort();
            console.log(`📊 Total data: ${keys.length}`);

            const last15Keys = keys.slice(-15);

            last15Keys.forEach(key => {
                const entry = historyData[key];
                let suhu = 0;

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

                if (suhu > 0) {
                    const date = new Date(parseKeyToTimestamp(key));
                    labels.push(String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'));
                    values.push(suhu);
                }
            });
        }

        if (labels.length === 0) {
            const sensorSnap = await get(ref(db, 'sensor'));
            const sensorData = sensorSnap.val();
            if (sensorData) {
                const suhu = sensorData.suhu || 0;
                const timestamp = sensorData.timestamp || Date.now();
                if (suhu > 0) {
                    const time = new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    labels.push(time);
                    values.push(suhu);
                    console.log(`✅ Data dari sensor: ${suhu}°C`);
                }
            }
        }

        if (labels.length === 0) {
            chart.data.labels = ['Tidak Ada Data'];
            chart.data.datasets[0].data = [0];
            chart.update();
            return;
        }

        if (labels.length > 15) {
            labels.splice(0, labels.length - 15);
            values.splice(0, values.length - 15);
        }

        chart.data.labels = labels;
        chart.data.datasets[0].data = values;
        chart.update();
        console.log(`✅ Dashboard chart loaded: ${labels.length} data`);
    } catch (e) {
        console.error('❌ loadDashChartHistory error:', e);
        if (dashTempChart) {
            dashTempChart.data.labels = ['Error Load Data'];
            dashTempChart.data.datasets[0].data = [0];
            dashTempChart.update();
        }
    }
}

// ============================================
// REDUCE TO HOURLY (FALLBACK)
// ============================================
function reduceToHourly(data, totalPoints) {
    if (data.length === 0) return [];
    data.sort((a, b) => a.timestamp - b.timestamp);
    const start = data[0].timestamp;
    const end = data[data.length - 1].timestamp;
    const interval = (end - start) / (totalPoints - 1 || 1);
    const result = [];
    for (let i = 0; i < totalPoints; i++) {
        const target = start + i * interval;
        let closest = data[0], minDiff = Math.abs(data[0].timestamp - target);
        for (const point of data) {
            const diff = Math.abs(point.timestamp - target);
            if (diff < minDiff) { minDiff = diff; closest = point; }
        }
        result.push(closest);
    }
    return result;
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
            // Buat canvas baru (replace)
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
// UPDATE ALL CHARTS
// ============================================
export function updateAllCharts() {
    console.log('🔄 updateAllCharts');
    if (tempChart) tempChart.update();
    if (lightChart) lightChart.update();
    if (lampStatusChart) lampStatusChart.update();
    if (dashTempChart) dashTempChart.update();
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
// HEATMAP 7 HARI
// ============================================
function updateHeatmap(data) {
    const table = document.getElementById('heatmapTable');
    if (!table) return;
    
    const days = {};
    data.forEach(d => {
        const ts = parseKeyToTimestamp(d.key);
        if (ts === 0) return;
        const date = new Date(ts);
        const day = date.toISOString().slice(0, 10);
        if (!days[day]) days[day] = [];
        days[day].push({ hour: date.getHours(), suhu: d.suhu });
    });
    
    const sortedDays = Object.keys(days).sort().reverse();
    const last7Days = sortedDays.slice(0, 7).reverse();
    
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
// HISTOGRAM
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
// EXPORT DATA PER TANGGAL
// ============================================
export async function exportDataByDate(dateStr) {
    const status = DOM.exportStatus;
    if (status) status.textContent = '⏳ Mengambil data...';
    
    try {
        if (!dateStr) {
            showToast('⚠️ Pilih tanggal dulu!', 'warning');
            return;
        }
        
        const snapshot = await get(ref(db, 'sensor_history'));
        const historyData = snapshot.val();
        
        if (!historyData) {
            showToast('⚠️ Tidak ada data', 'warning');
            return;
        }
        
        const keys = Object.keys(historyData).filter(key => key.includes('T') && key.includes(dateStr)).sort();
        
        if (keys.length === 0) {
            showToast(`⚠️ Tidak ada data untuk ${dateStr}`, 'warning');
            return;
        }
        
        const hourlyKeys = keys.filter(key => {
            const parts = key.split('T');
            if (parts.length !== 2) return false;
            const timePart = parts[1].split('-');
            if (timePart.length < 2) return false;
            const minute = parseInt(timePart[1]);
            return minute === 0;
        });
        
        if (hourlyKeys.length === 0) {
            showToast(`⚠️ Tidak ada data per jam untuk ${dateStr}`, 'warning');
            return;
        }
        
        const sortedData = hourlyKeys.map(key => {
            const entry = historyData[key];
            let suhu = 0, cahaya = 0, lampu = false;
            
            if (entry.suhu) {
                suhu = entry.suhu.value ?? entry.suhu ?? 0;
            }
            if (entry.cahaya) {
                cahaya = entry.cahaya.value ?? entry.cahaya ?? 0;
            }
            if (entry.lampu) {
                lampu = entry.lampu.state === true || entry.lampu.state === 1 || entry.lampu.state === 'ON';
            }
            
            return { key, suhu: Number(suhu), cahaya: Number(cahaya), lampu };
        });
        
        let csv = `"LAPORAN DATA SENSOR"\n`;
        csv += `"Tanggal Export","${new Date().toLocaleString('id-ID')}"\n`;
        csv += `"Periode","${dateStr}"\n`;
        csv += `"Total Data","${sortedData.length}"\n\n`;
        csv += `"Jam","Suhu (°C)","Cahaya (lux)","Status Lampu"\n`;
        
        sortedData.forEach((row) => {
            const hour = row.key.split('T')[1].split('-')[0] + ':' + row.key.split('T')[1].split('-')[1];
            csv += `"${hour}","${row.suhu.toFixed(1) || ''}","${row.cahaya || ''}","${row.lampu ? 'ON' : 'OFF'}"\n`;
        });
        
        csv += `\n"--- AKHIR LAPORAN ---"`;
        
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `laporan_sensor_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        if (status) status.textContent = `✅ Berhasil ekspor ${sortedData.length} data!`;
        showToast(`✅ Data ${dateStr} berhasil diekspor!`, 'success');
    } catch (e) {
        console.error('❌ exportDataByDate error:', e);
        if (DOM.exportStatus) DOM.exportStatus.textContent = '❌ Gagal ekspor data.';
        showToast('❌ Gagal ekspor: ' + e.message, 'error');
    }
}

// ============================================
// EXPORT DATA RANGE
// ============================================
export async function exportData(period) {
    const status = DOM.exportStatus;
    if (status) status.textContent = '⏳ Mengambil data...';
    try {
        const now = new Date();
        const start = new Date(now);
        period === 'week' ? start.setDate(now.getDate() - 7) : start.setMonth(now.getMonth() - 1);
        const startStr = start.toISOString().slice(0, 10);
        
        const snapshot = await get(ref(db, 'sensor_history'));
        const historyData = snapshot.val();
        
        if (!historyData) {
            showToast('⚠️ Tidak ada data', 'warning');
            return;
        }
        
        const keys = Object.keys(historyData).filter(key => {
            if (!key.includes('T')) return false;
            const datePart = key.split('T')[0];
            return datePart >= startStr;
        }).sort();
        
        if (keys.length === 0) {
            if (status) status.textContent = '⚠️ Tidak ada data untuk periode ini.';
            return;
        }
        
        const hourlyKeys = keys.filter(key => {
            const parts = key.split('T');
            if (parts.length !== 2) return false;
            const timePart = parts[1].split('-');
            if (timePart.length < 2) return false;
            const minute = parseInt(timePart[1]);
            return minute === 0;
        });
        
        if (hourlyKeys.length === 0) {
            if (status) status.textContent = '⚠️ Tidak ada data per jam.';
            return;
        }
        
        const sortedData = hourlyKeys.map(key => {
            const entry = historyData[key];
            let suhu = 0, cahaya = 0, lampu = false;
            
            if (entry.suhu) {
                suhu = entry.suhu.value ?? entry.suhu ?? 0;
            }
            if (entry.cahaya) {
                cahaya = entry.cahaya.value ?? entry.cahaya ?? 0;
            }
            if (entry.lampu) {
                lampu = entry.lampu.state === true || entry.lampu.state === 1 || entry.lampu.state === 'ON';
            }
            
            return { key, suhu: Number(suhu), cahaya: Number(cahaya), lampu };
        });
        
        let csv = `"LAPORAN DATA SENSOR"\n`;
        csv += `"Tanggal Export","${new Date().toLocaleString('id-ID')}"\n`;
        csv += `"Periode","${period === 'week' ? '1 Minggu' : '1 Bulan'}"\n`;
        csv += `"Total Data","${sortedData.length}"\n\n`;
        csv += `"Tanggal","Jam","Suhu (°C)","Cahaya (lux)","Status Lampu"\n`;
        
        sortedData.forEach((row) => {
            const datePart = row.key.split('T')[0];
            const hour = row.key.split('T')[1].split('-')[0] + ':' + row.key.split('T')[1].split('-')[1];
            csv += `"${datePart}","${hour}","${row.suhu.toFixed(1) || ''}","${row.cahaya || ''}","${row.lampu ? 'ON' : 'OFF'}"\n`;
        });
        
        csv += `\n"--- AKHIR LAPORAN ---"`;
        
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `laporan_sensor_${period}_${now.toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        if (status) status.textContent = `✅ Berhasil ekspor ${sortedData.length} data!`;
    } catch (e) {
        console.error(e);
        if (DOM.exportStatus) DOM.exportStatus.textContent = '❌ Gagal ekspor data. Cek console.';
    }
}

// ============================================
// EXPORT PDF
// ============================================
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

// ============================================
// LOAD DAILY HISTORY
// ============================================
export async function loadDailyHistory() {
    try {
        const snapshot = await get(ref(db, 'daily_history'));
        const data = snapshot.val();
        const tbody = document.getElementById('dailyHistoryBody');
        if (!tbody) return;
        if (!data) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:16px;">Belum ada data</td></tr>';
            return;
        }
        const dates = Object.keys(data).sort().reverse();
        let html = '';
        dates.forEach(date => {
            const d = data[date];
            const growlight = d.growlight || 0;
            const target = d.target || 12;
            const status = d.status || (growlight >= target ? '✅ Cukup' : '🔴 Kurang');
            const color = d.statusColor || (growlight >= target ? '#22c55e' : '#ef4444');
            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:6px 8px; color:var(--text-muted);">${date}</td>
                <td style="padding:6px 8px; color:#22c55e; font-weight:600;">${growlight.toFixed(1)} jam</td>
                <td style="padding:6px 8px; color:#f59e0b; font-weight:600;">${target.toFixed(1)} jam</td>
                <td style="padding:6px 8px; color:${color}; font-weight:600;">${status}</td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:16px;">Belum ada data</td></tr>';
    } catch (e) { console.error('❌ loadDailyHistory:', e); }
}

// ============================================
// LOAD DASHBOARD
// ============================================
export async function loadDashboard() {
    console.log('📊 loadDashboard - mulai');
    try {
        const snapshot = await get(ref(db, 'sensor'));
        const data = snapshot.val();
        
        if (data) {
            const suhu = data.suhu || 0;
            const kelembapan = data.kelembapan || 0;
            const cahaya = data.cahaya || 0;
            const lampu = data.lampu || false;
            
            const tempEl = document.getElementById('dashTempValue');
            const humidEl = document.getElementById('dashHumidityValue');
            const lightEl = document.getElementById('dashLightValue');
            const statusEl = document.getElementById('dashLampStatusText');
            
            if (tempEl) tempEl.textContent = suhu.toFixed(1);
            if (humidEl) humidEl.textContent = kelembapan.toFixed(1);
            if (lightEl) lightEl.textContent = Math.round(cahaya);
            if (statusEl) statusEl.textContent = lampu ? '💡 ON' : '⛔ OFF';
            
            console.log('✅ Dashboard updated');
        }
    } catch (e) {
        console.error('❌ loadDashboard error:', e);
    }
}

// ============================================
// LOAD DASH HISTORY
// ============================================
export async function loadDashHistory() {
    console.log('📊 loadDashHistory - mulai');
    try {
        const snapshot = await get(ref(db, 'sensor_history'));
        const historyData = snapshot.val();
        
        if (!historyData) {
            console.log('⚠️ Tidak ada data history untuk dashboard');
            return;
        }

        const keys = Object.keys(historyData).filter(key => key.includes('T')).sort();
        console.log(`📊 Dashboard total data: ${keys.length}`);

        if (keys.length === 0) return;

        const last15Keys = keys.slice(-15);
        const labels = [];
        const suhuData = [];
        const humData = [];

        last15Keys.forEach(key => {
            const entry = historyData[key];
            let suhu = 0, hum = 0;

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

            if (entry.kelembapan) {
                hum = entry.kelembapan.value ?? entry.kelembapan ?? 0;
            } else {
                for (const subKey of Object.keys(entry)) {
                    const subNode = entry[subKey];
                    if (subNode && typeof subNode === 'object' && subNode.value !== undefined) {
                        if (!hum) hum = parseFloat(subNode.value) || 0;
                        break;
                    }
                }
            }

            const timestamp = parseKeyToTimestamp(key);
            if (timestamp > 0 && suhu > 0) {
                const date = new Date(timestamp);
                labels.push(String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'));
                suhuData.push(suhu);
                humData.push(hum > 0 ? hum : null);
            }
        });

        if (labels.length === 0) {
            console.log('⚠️ Tidak ada data valid untuk dashboard');
            return;
        }

        if (dashTempChart) {
            dashTempChart.data.labels = labels;
            dashTempChart.data.datasets = [
                {
                    label: 'Suhu (°C)',
                    data: suhuData,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34,197,94,0.15)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#22c55e',
                    yAxisID: 'y'
                },
                {
                    label: 'Kelembapan (%)',
                    data: humData,
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56,189,248,0.15)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#38bdf8',
                    yAxisID: 'y1'
                }
            ];
            dashTempChart.options = {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        labels: { color: '#cbd5e1', font: { size: 10 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null && context.parsed.y !== undefined) {
                                    label += context.parsed.y.toFixed(1);
                                    if (context.dataset.label.includes('Suhu')) {
                                        label += '°C';
                                    } else if (context.dataset.label.includes('Kelembapan')) {
                                        label += '%';
                                    }
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', maxTicksLimit: 10, font: { size: 9 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        ticks: { color: '#22c55e', font: { size: 9 } },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        title: {
                            display: true,
                            text: 'Suhu (°C)',
                            color: '#22c55e',
                            font: { size: 9 }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        ticks: { color: '#38bdf8', font: { size: 9 } },
                        grid: { drawOnChartArea: false },
                        title: {
                            display: true,
                            text: 'Kelembapan (%)',
                            color: '#38bdf8',
                            font: { size: 9 }
                        }
                    }
                }
            };
            dashTempChart.update();
            console.log(`✅ Dashboard chart updated: ${labels.length} data`);
        }
    } catch (e) {
        console.error('❌ loadDashHistory error:', e);
    }
}

// ============================================
// UPDATE DASHBOARD CHART
// ============================================
export function updateDashboardChart(suhu, hum, timestamp) {
    try {
        if (!dashTempChart) return;
        
        const labels = dashTempChart.data.labels || [];
        const suhuData = dashTempChart.data.datasets?.[0]?.data || [];
        const humData = dashTempChart.data.datasets?.[1]?.data || [];
        
        const time = new Date(timestamp).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        labels.push(time);
        suhuData.push(suhu);
        humData.push(hum);
        
        if (labels.length > 15) {
            labels.shift();
            suhuData.shift();
            humData.shift();
        }
        
        dashTempChart.data.labels = labels;
        dashTempChart.data.datasets[0].data = suhuData;
        dashTempChart.data.datasets[1].data = humData;
        dashTempChart.update('none');
    } catch (e) {}
}

// ============================================
// RESET CACHE
// ============================================
export function resetAnalyticsCache() {
    localStorage.removeItem(CACHE_KEY);
    console.log('🗑️ Cache analytics dihapus!');
    showToast('🗑️ Cache dihapus, reload halaman...', 'info');
    setTimeout(() => location.reload(), 500);
}

window.resetAnalyticsCache = resetAnalyticsCache;

console.log('✅ analytics.js loaded (BRUTAL METHOD)');