// ============================================
// 🏠 DASHBOARD SECTION - INDEPENDENT
// ============================================

import { db, state } from '../firebase.js';
import { ref, onValue, get, query, orderByKey, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

console.log('📊 dashboard.js loaded');

// ============================================
// DASHBOARD STATE
// ============================================
const DashboardState = {
    chartInstance: null,
    tempHistory: [],
    humHistory: [],
    labels: []
};

// ============================================
// 1. PARSE TIMESTAMP (FIREBASE KEY)
// ============================================
function parseKeyToTimestamp(key) {
    try {
        const clean = key.replace(/-000Z$/, '');
        const [datePart, timePart] = clean.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute, second] = timePart.split('-').map(Number);
        return new Date(year, month - 1, day, hour, minute, second).getTime();
    } catch (e) { return 0; }
}

// ============================================
// 2. INIT CHART (2 LINE: SUHU + KELEMBAPAN)
// ============================================
export function initDashChart() {
    console.log('📊 initDashChart');
    const canvas = document.getElementById('dashEnvChart');
    if (!canvas) {
        console.warn('⚠️ Canvas dashEnvChart tidak ditemukan');
        return;
    }

    const existing = Chart.getChart(canvas);
    if (existing) {
        console.log('⚠️ Destroy existing chart');
        existing.destroy();
    }
    if (DashboardState.chartInstance) {
        DashboardState.chartInstance.destroy();
        DashboardState.chartInstance = null;
    }

    const ctx = canvas.getContext('2d');
    DashboardState.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: DashboardState.labels,
            datasets: [
                {
                    label: 'Suhu (°C)',
                    data: DashboardState.tempHistory,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34,197,94,0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    pointBackgroundColor: '#22c55e',
                    yAxisID: 'y'
                },
                {
                    label: 'Kelembapan (%)',
                    data: DashboardState.humHistory,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    pointBackgroundColor: '#3b82f6',
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: false 
                },
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
                x: {
                    display: true,
                    ticks: { 
                        color: 'rgba(255,255,255,0.5)', 
                        maxTicksLimit: 10, 
                        font: { size: 9 } 
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    display: true,
                    ticks: { 
                        color: 'rgba(255,255,255,0.5)', 
                        font: { size: 9 } 
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    min: 0,
                    max: 100
                }
            },
            animation: { duration: 300 }
        }
    });
    console.log('✅ Dashboard 2-line chart initialized');
}

// ============================================
// 3. UPDATE CHART (SUHU + KELEMBAPAN)
// ============================================
export function updateDashChart(temp, humidity, timestamp) {
    if (!DashboardState.chartInstance) {
        initDashChart();
        if (!DashboardState.chartInstance) return;
    }

    const time = new Date(timestamp || Date.now()).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const chart = DashboardState.chartInstance;
    
    // Update labels
    chart.data.labels.push(time);
    
    // Update data
    chart.data.datasets[0].data.push(Math.round(temp * 10) / 10);
    chart.data.datasets[1].data.push(Math.round(humidity * 10) / 10);

    // Batasi 15 data
    if (chart.data.labels.length > 15) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
    }

    chart.update('none');
    updateStability(chart.data.datasets[0].data);
}

// ============================================
// 4. UPDATE STABILITY
// ============================================
function updateStability(data) {
    const el = document.getElementById('chartStatus');
    if (!el || data.length < 5) return;

    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / data.length;

    if (variance < 1) {
        el.textContent = '🟢 Stabil';
        el.style.color = '#22c55e';
    } else if (variance < 5) {
        el.textContent = '🟡 Fluktuatif';
        el.style.color = '#f59e0b';
    } else {
        el.textContent = '🔴 Tidak Stabil';
        el.style.color = '#ef4444';
    }
}

// ============================================
// 5. UPDATE CARDS (3 CARD)
// ============================================
export function updateDashboardCards(temp, lux, lampState, humidity) {
    requestAnimationFrame(() => {
        // ─── CARD 1: SUHU + KELEMBAPAN (GABUNG) ───
        const tempVal = document.getElementById('dashTempValue');
        const tempStatus = document.getElementById('dashTempStatus');
        if (tempVal) tempVal.textContent = temp.toFixed(1);
        
        let tempCategory = '🌤️ Normal', tempColor = '#22c55e';
        if (temp > 35) { tempCategory = '🔥 Sangat Panas'; tempColor = '#ef4444'; }
        else if (temp > 30) { tempCategory = '🔥 Panas'; tempColor = '#f59e0b'; }
        else if (temp < 20) { tempCategory = '❄️ Dingin'; tempColor = '#3b82f6'; }
        if (tempStatus) { tempStatus.textContent = tempCategory; tempStatus.style.color = tempColor; }

        const humVal = document.getElementById('dashHumidityValue');
        const humStatus = document.getElementById('dashHumidityStatus');
        if (humVal) humVal.textContent = humidity.toFixed(1);
        
        let humCategory = '🌤️ Normal', humColor = '#22c55e';
        if (humidity > 80) { humCategory = '💧 Sangat Lembab'; humColor = '#3b82f6'; }
        else if (humidity > 70) { humCategory = '💧 Lembab'; humColor = '#60a5fa'; }
        else if (humidity < 40) { humCategory = '🔥 Kering'; humColor = '#f59e0b'; }
        else if (humidity < 30) { humCategory = '🔥 Sangat Kering'; humColor = '#ef4444'; }
        if (humStatus) { humStatus.textContent = humCategory; humStatus.style.color = humColor; }

        // ─── CARD 2: INTENSITAS CAHAYA ───
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

        // ─── CARD 3: WAKTU OPERASIONAL (Durasi + Status ON/OFF) ───
        const lampDuration = document.getElementById('dashLampDuration');
        const lampText = document.getElementById('dashLampStatusText');
        const accumulatedLight = state.accumulatedLight || 0;
        
        if (lampDuration) lampDuration.textContent = accumulatedLight.toFixed(1);
        
        const statusText = lampState ? '💡 ON' : '⛔ Mati';
        const statusColor = lampState ? '#22c55e' : '#ef4444';
        if (lampText) { lampText.textContent = statusText; lampText.style.color = statusColor; }

        // ─── MODE KONTROL ───
        const modeDisplay = document.getElementById('dashModeDisplay');
        if (modeDisplay) {
            const labels = { otomatis: '🤖 Otomatis', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
            modeDisplay.textContent = labels[state.controlMode] || '🤖 Otomatis';
        }

        // ─── STATUS SISTEM ───
        const connStatus = document.getElementById('dashConnStatus');
        if (connStatus) { 
            connStatus.textContent = '● Online'; 
            connStatus.className = 'status-badge online'; 
        }

        const lastUpdate = document.getElementById('dashLastUpdate');
        if (lastUpdate) {
            lastUpdate.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
        }

        const latestTemp = document.getElementById('dashLatestTemp');
        if (latestTemp) {
            latestTemp.textContent = temp.toFixed(1) + '°C';
        }
    });
}

// ============================================
// 6. LOAD HISTORY (UNTUK CHART)
// ============================================
export async function loadDashHistory() {
    try {
        console.log('📊 loadDashHistory');
        const [suhuSnap, humSnap] = await Promise.all([
            get(query(ref(db, 'sensor_history/suhu'), orderByKey(), limitToLast(15))),
            get(query(ref(db, 'sensor_history/kelembapan'), orderByKey(), limitToLast(15)))
        ]);

        const suhuData = suhuSnap.val() || {};
        const humData = humSnap.val() || {};

        const keys = Object.keys(suhuData).sort();
        if (keys.length === 0) {
            console.log('⚠️ Tidak ada data history untuk dashboard');
            return;
        }

        const labels = [];
        const temps = [];
        const hums = [];

        keys.forEach(key => {
            const entry = suhuData[key];
            const humEntry = humData[key];
            const suhu = entry?.value ?? entry ?? 0;
            const hum = humEntry?.value ?? humEntry ?? 0;
            if (suhu > 0) {
                const date = new Date(parseKeyToTimestamp(key));
                labels.push(String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'));
                temps.push(Math.round(suhu * 10) / 10);
                hums.push(Math.round(hum * 10) / 10);
            }
        });

        if (DashboardState.chartInstance && labels.length > 0) {
            DashboardState.chartInstance.data.labels = labels;
            DashboardState.chartInstance.data.datasets[0].data = temps;
            DashboardState.chartInstance.data.datasets[1].data = hums;
            DashboardState.chartInstance.update();
            updateStability(temps);
            console.log(`✅ Dashboard chart loaded: ${labels.length} data (${temps.length} temp, ${hums.length} hum)`);
        }
    } catch (e) {
        console.error('❌ loadDashHistory error:', e);
    }
}

// ============================================
// 7. LOAD DASHBOARD CHART HISTORY (DARI ANALYTICS.JS)
// ============================================
export async function loadDashChartHistory() {
    try {
        console.log('📊 loadDashChartHistory (dashboard)');
        const snapshot = await get(query(ref(db, 'sensor_history/suhu'), orderByKey(), limitToLast(15)));
        const data = snapshot.val();
        if (!data) {
            if (DashboardState.chartInstance) {
                DashboardState.chartInstance.data.labels = ['Tidak Ada Data'];
                DashboardState.chartInstance.data.datasets[0].data = [0];
                DashboardState.chartInstance.data.datasets[1].data = [0];
                DashboardState.chartInstance.update();
            }
            return;
        }
        
        const keys = Object.keys(data).sort();
        const labels = [];
        const temps = [];
        const hums = [];

        // Ambil juga data kelembapan
        const humSnap = await get(query(ref(db, 'sensor_history/kelembapan'), orderByKey(), limitToLast(15)));
        const humData = humSnap.val() || {};

        keys.forEach(key => {
            const entry = data[key];
            const humEntry = humData[key];
            const suhu = entry?.value ?? entry ?? 0;
            const hum = humEntry?.value ?? humEntry ?? 0;
            if (suhu > 0) {
                const date = new Date(parseKeyToTimestamp(key));
                labels.push(String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'));
                temps.push(Math.round(suhu * 10) / 10);
                hums.push(Math.round(hum * 10) / 10);
            }
        });

        if (DashboardState.chartInstance) {
            DashboardState.chartInstance.data.labels = labels.length > 0 ? labels : ['Tidak Ada Data'];
            DashboardState.chartInstance.data.datasets[0].data = temps.length > 0 ? temps : [0];
            DashboardState.chartInstance.data.datasets[1].data = hums.length > 0 ? hums : [0];
            DashboardState.chartInstance.update();
            if (temps.length > 0) updateStability(temps);
            console.log(`✅ Dashboard chart loaded: ${temps.length} data`);
        }
    } catch (e) {
        console.error('❌ loadDashChartHistory error:', e);
    }
}

// ============================================
// 8. INIT DASHBOARD (LISTENER)
// ============================================
let unsubSensor = null;
let unsubSystem = null;

export function initDashboard() {
    console.log('🏠 Dashboard init');

    // ─── SENSOR LISTENER ───
    unsubSensor = onValue(ref(db, 'sensor'), (snap) => {
        try {
            const d = snap.val();
            if (!d) return;

            const suhu = d.suhu || 0;
            const lux = d.cahaya || 0;
            const hum = d.kelembapan || 0;
            const timestamp = d.timestamp || Date.now();

            // Update cards
            updateDashboardCards(suhu, lux, state.lampState, hum);

            // Update chart (2 line)
            updateDashChart(suhu, hum, timestamp);

            // Update status sistem - last update
            const lastUpdate = document.getElementById('dashLastUpdate');
            if (lastUpdate) {
                lastUpdate.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
            }

        } catch (e) {
            console.error('❌ Dashboard sensor error:', e);
        }
    }, (err) => {
        console.error('❌ Dashboard sensor error:', err);
    });

    // ─── SYSTEM LISTENER ───
    unsubSystem = onValue(ref(db, 'system'), (snap) => {
        try {
            const d = snap.val();
            if (!d) return;

            // Update state
            state.lampState = d.actual_state || false;
            state.accumulatedLight = d.accumulated_light || 0;
            state.controlMode = d.mode || 'otomatis';
            state.totalLightNeeded = d.total_light_needed || 12;

            // Update cards (refresh dengan data terbaru)
            // Ambil data sensor terakhir dari DOM
            const tempEl = document.getElementById('dashTempValue');
            const lightEl = document.getElementById('dashLightValue');
            const humEl = document.getElementById('dashHumidityValue');
            
            const temp = tempEl ? parseFloat(tempEl.textContent) || 0 : 0;
            const lux = lightEl ? parseInt(lightEl.textContent) || 0 : 0;
            const hum = humEl ? parseFloat(humEl.textContent) || 0 : 0;

            updateDashboardCards(temp, lux, state.lampState, hum);

            // Update durasi saja
            const lampDuration = document.getElementById('dashLampDuration');
            if (lampDuration) {
                lampDuration.textContent = (state.accumulatedLight || 0).toFixed(1);
            }

            // Update mode
            const modeDisplay = document.getElementById('dashModeDisplay');
            if (modeDisplay) {
                const labels = { otomatis: '🤖 Otomatis', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
                modeDisplay.textContent = labels[state.controlMode] || '🤖 Otomatis';
            }

        } catch (e) {
            console.error('❌ Dashboard system error:', e);
        }
    }, (err) => {
        console.error('❌ Dashboard system error:', err);
    });

    console.log('✅ Dashboard ready');
}

// ============================================
// 9. CLEANUP
// ============================================
export function cleanupDashboard() {
    if (unsubSensor) { 
        unsubSensor(); 
        unsubSensor = null; 
    }
    if (unsubSystem) { 
        unsubSystem(); 
        unsubSystem = null; 
    }
    if (DashboardState.chartInstance) {
        DashboardState.chartInstance.destroy();
        DashboardState.chartInstance = null;
    }
    DashboardState.tempHistory = [];
    DashboardState.humHistory = [];
    DashboardState.labels = [];
    console.log('🧹 Dashboard cleaned up');
}

console.log('✅ dashboard.js loaded');
