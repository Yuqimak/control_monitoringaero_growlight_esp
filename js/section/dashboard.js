// ============================================
// DASHBOARD SECTION
// ============================================

// ✅ PATH BENAR: naik ke js/ untuk ambil firebase.js
import { db, state } from '../firebase.js';
import { ref, onValue, get, query, orderByKey, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

console.log('📊 dashboard.js loaded');

let dashChartInstance = null;
let unsubSensor = null;
let unsubSystem = null;

function parseKey(key) {
    try {
        const clean = key.replace(/-000Z$/, '');
        const [datePart, timePart] = clean.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute, second] = timePart.split('-').map(Number);
        return new Date(year, month - 1, day, hour, minute, second).getTime();
    } catch (e) { return 0; }
}

function updateStability(data) {
    const el = document.getElementById('chartStatus');
    if (!el || data.length < 5) return;
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / data.length;
    if (variance < 1) { el.textContent = '🟢 Stabil'; el.style.color = '#22c55e'; }
    else if (variance < 5) { el.textContent = '🟡 Fluktuatif'; el.style.color = '#f59e0b'; }
    else { el.textContent = '🔴 Tidak Stabil'; el.style.color = '#ef4444'; }
}

export function initDashChart() {
    console.log('📊 initDashChart');
    const canvas = document.getElementById('dashEnvChart');
    if (!canvas) return;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    if (dashChartInstance) { dashChartInstance.destroy(); dashChartInstance = null; }
    const ctx = canvas.getContext('2d');
    dashChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Suhu (°C)', data: [], borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 2 },
                { label: 'Kelembapan (%)', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(ctx) {
                            const label = ctx.dataset.label || '';
                            const value = ctx.parsed.y;
                            return label + ': ' + value.toFixed(1) + (label.includes('Suhu') ? '°C' : '%');
                        }
                    }
                }
            },
            scales: {
                x: { display: true, ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 10, font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { display: true, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0, max: 100 }
            }
        }
    });
}

function updateDashChart(temp, humidity, timestamp) {
    if (!dashChartInstance) { initDashChart(); if (!dashChartInstance) return; }
    const time = new Date(timestamp || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const chart = dashChartInstance;
    chart.data.labels.push(time);
    chart.data.datasets[0].data.push(Math.round(temp * 10) / 10);
    chart.data.datasets[1].data.push(Math.round(humidity * 10) / 10);
    if (chart.data.labels.length > 15) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
    }
    chart.update('none');
    updateStability(chart.data.datasets[0].data);
}

function updateDashboardCards(temp, lux, lampState, humidity) {
    requestAnimationFrame(() => {
        // SUHU
        const tempVal = document.getElementById('dashTempValue');
        const tempStatus = document.getElementById('dashTempStatus');
        if (tempVal) tempVal.textContent = temp.toFixed(1);
        let tempCategory = '🌤️ Normal', tempColor = '#22c55e';
        if (temp > 35) { tempCategory = '🔥 Sangat Panas'; tempColor = '#ef4444'; }
        else if (temp > 30) { tempCategory = '🔥 Panas'; tempColor = '#f59e0b'; }
        else if (temp < 20) { tempCategory = '❄️ Dingin'; tempColor = '#3b82f6'; }
        if (tempStatus) { tempStatus.textContent = tempCategory; tempStatus.style.color = tempColor; }

        // KELEMBAPAN
        const humVal = document.getElementById('dashHumidityValue');
        const humStatus = document.getElementById('dashHumidityStatus');
        if (humVal) humVal.textContent = humidity.toFixed(1);
        let humCategory = '🌤️ Normal', humColor = '#22c55e';
        if (humidity > 80) { humCategory = '💧 Sangat Lembab'; humColor = '#3b82f6'; }
        else if (humidity > 70) { humCategory = '💧 Lembab'; humColor = '#60a5fa'; }
        else if (humidity < 40) { humCategory = '🔥 Kering'; humColor = '#f59e0b'; }
        else if (humidity < 30) { humCategory = '🔥 Sangat Kering'; humColor = '#ef4444'; }
        if (humStatus) { humStatus.textContent = humCategory; humStatus.style.color = humColor; }

        // CAHAYA
        const lightVal = document.getElementById('dashLightValue');
        const lightStatus = document.getElementById('dashLightStatus');
        if (lightVal) lightVal.textContent = Math.round(lux);
        let lCat = '🌤️ Sedang', lColor = '#94a3b8';
        if (lux > 4000) { lCat = '☀️ Sangat Terang'; lColor = '#facc15'; }
        else if (lux > 2000) { lCat = '🌤️ Terang'; lColor = '#f59e0b'; }
        else if (lux > 500) { lCat = '🌥️ Sedang'; lColor = '#94a3b8'; }
        else if (lux > 100) { lCat = '🌥️ Redup'; lColor = '#64748b'; }
        else { lCat = '🌙 Gelap'; lColor = '#3b82f6'; }
        if (lightStatus) { lightStatus.textContent = lCat; lightStatus.style.color = lColor; }

        // WAKTU OPERASIONAL
        const lampDuration = document.getElementById('dashLampDuration');
        const lampText = document.getElementById('dashLampStatusText');
        const accumulatedLight = state.accumulatedLight || 0;
        if (lampDuration) lampDuration.textContent = accumulatedLight.toFixed(1);
        const statusText = lampState ? '💡 ON' : '⛔ Mati';
        const statusColor = lampState ? '#22c55e' : '#ef4444';
        if (lampText) { lampText.textContent = statusText; lampText.style.color = statusColor; }

        // MODE
        const modeDisplay = document.getElementById('dashModeDisplay');
        if (modeDisplay) {
            const labels = { otomatis: '🤖 Otomatis', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
            modeDisplay.textContent = labels[state.controlMode] || '🤖 Otomatis';
        }

        // STATUS SISTEM
        const connStatus = document.getElementById('dashConnStatus');
        if (connStatus) { connStatus.textContent = '● Online'; connStatus.className = 'status-badge online'; }
        const lastUpdate = document.getElementById('dashLastUpdate');
        if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
        const latestTemp = document.getElementById('dashLatestTemp');
        if (latestTemp) latestTemp.textContent = temp.toFixed(1) + '°C';
    });
}

async function loadDashHistory() {
    try {
        console.log('📊 loadDashHistory');
        const [suhuSnap, humSnap] = await Promise.all([
            get(query(ref(db, 'sensor_history/suhu'), orderByKey(), limitToLast(15))),
            get(query(ref(db, 'sensor_history/kelembapan'), orderByKey(), limitToLast(15)))
        ]);
        const suhuData = suhuSnap.val() || {};
        const humData = humSnap.val() || {};
        const keys = Object.keys(suhuData).sort();
        if (keys.length === 0) return;
        const labels = [], temps = [], hums = [];
        keys.forEach(key => {
            const entry = suhuData[key];
            const humEntry = humData[key];
            const suhu = entry?.value ?? entry ?? 0;
            const hum = humEntry?.value ?? humEntry ?? 0;
            if (suhu > 0) {
                const date = new Date(parseKey(key));
                labels.push(String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'));
                temps.push(Math.round(suhu * 10) / 10);
                hums.push(Math.round(hum * 10) / 10);
            }
        });
        if (dashChartInstance && labels.length > 0) {
            dashChartInstance.data.labels = labels;
            dashChartInstance.data.datasets[0].data = temps;
            dashChartInstance.data.datasets[1].data = hums;
            dashChartInstance.update();
            updateStability(temps);
        }
    } catch (e) { console.error('❌ loadDashHistory error:', e); }
}

export function initDashboard() {
    console.log('🏠 Dashboard init');
    initDashChart();
    setTimeout(loadDashHistory, 500);

    unsubSensor = onValue(ref(db, 'sensor'), (snap) => {
        try {
            const d = snap.val();
            if (!d) return;
            updateDashboardCards(d.suhu || 0, d.cahaya || 0, state.lampState, d.kelembapan || 0);
            updateDashChart(d.suhu || 0, d.kelembapan || 0, d.timestamp || Date.now());
            const lastUpdate = document.getElementById('dashLastUpdate');
            if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
        } catch (e) { console.error('❌ Dashboard sensor error:', e); }
    });

    unsubSystem = onValue(ref(db, 'system'), (snap) => {
        try {
            const d = snap.val();
            if (!d) return;
            state.lampState = d.actual_state || false;
            state.accumulatedLight = d.accumulated_light || 0;
            state.controlMode = d.mode || 'otomatis';
            state.totalLightNeeded = d.total_light_needed || 12;
            const tempEl = document.getElementById('dashTempValue');
            const lightEl = document.getElementById('dashLightValue');
            const humEl = document.getElementById('dashHumidityValue');
            const temp = tempEl ? parseFloat(tempEl.textContent) || 0 : 0;
            const lux = lightEl ? parseInt(lightEl.textContent) || 0 : 0;
            const hum = humEl ? parseFloat(humEl.textContent) || 0 : 0;
            updateDashboardCards(temp, lux, state.lampState, hum);
            const lampDuration = document.getElementById('dashLampDuration');
            if (lampDuration) lampDuration.textContent = (state.accumulatedLight || 0).toFixed(1);
            const modeDisplay = document.getElementById('dashModeDisplay');
            if (modeDisplay) {
                const labels = { otomatis: '🤖 Otomatis', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
                modeDisplay.textContent = labels[state.controlMode] || '🤖 Otomatis';
            }
        } catch (e) { console.error('❌ Dashboard system error:', e); }
    });
}

export function cleanupDashboard() {
    if (unsubSensor) { unsubSensor(); unsubSensor = null; }
    if (unsubSystem) { unsubSystem(); unsubSystem = null; }
    if (dashChartInstance) { dashChartInstance.destroy(); dashChartInstance = null; }
    console.log('🧹 Dashboard cleaned');
}
