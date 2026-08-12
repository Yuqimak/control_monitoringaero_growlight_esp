// ============================================
// MAIN ENTRY – app.js (FULL FIX - CHART LOAD)
// ============================================

import { db } from './firebase.js';
import { state, currentUser, setUser, DOM, initDOM, showToast } from './modules/core.js';
import { 
    initCharts, 
    exportData, 
    exportPDF, 
    loadChartHistory, 
    loadChartHistoryByDate, 
    loadDailyHistory,
    loadDashChartHistory 
} from './modules/analytics.js';
import { renderUI } from './modules/ui.js';
import { initAdminPanel } from './modules/admin.js';
import { ref, onValue, set, update, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

console.log('🚀 app.js loaded!');

// ============================================
// SESSION CHECK
// ============================================
const sessionData = localStorage.getItem('iot_user');
if (!sessionData) {
    window.location.href = 'login.html';
} else {
    try {
        const user = JSON.parse(sessionData);
        setUser(user);
        console.log('👤 Login sebagai:', user.nama, '(', user.username, ')');
        const loginTime = user.loginTime || 0;
        if (Date.now() - loginTime > 8 * 60 * 60 * 1000) {
            localStorage.removeItem('iot_user');
            window.location.href = 'login.html';
        }
    } catch (e) {
        localStorage.removeItem('iot_user');
        window.location.href = 'login.html';
    }
}

// ============================================
// EXPOSE GLOBAL
// ============================================
window.exportData = exportData;
window.exportPDF = exportPDF;
window.logout = function() {
    if (confirm('Yakin mau logout?')) {
        localStorage.removeItem('iot_user');
        window.location.href = 'login.html';
    }
};

// ============================================
// SMOOTHING FILTER
// ============================================
class SmoothingFilter {
    constructor(windowSize = 5) {
        this.windowSize = windowSize;
        this.values = [];
    }
    add(value) {
        this.values.push(value);
        if (this.values.length > this.windowSize) this.values.shift();
        const sum = this.values.reduce((a, b) => a + b, 0);
        return sum / this.values.length;
    }
    getAverage() {
        if (this.values.length === 0) return 0;
        const sum = this.values.reduce((a, b) => a + b, 0);
        return sum / this.values.length;
    }
}

const suhuFilter = new SmoothingFilter(5);
const luxFilter = new SmoothingFilter(5);

// ============================================
// FUNGSI BANTU
// ============================================
function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

// ============================================
// 🔵 SECTION 1: DASHBOARD
// ============================================
const Dashboard = {
    chartInstance: null,

    initChart() {
        console.log('📊 Dashboard.initChart()');
        const canvas = document.getElementById('dashTempChart');
        if (!canvas) {
            console.warn('⚠️ Canvas dashTempChart tidak ditemukan');
            return;
        }

        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            console.log('⚠️ Destroy existing chart on canvas');
            existingChart.destroy();
        }

        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }

        const ctx = canvas.getContext('2d');
        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Suhu (°C)',
                    data: [],
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34,197,94,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    pointBackgroundColor: '#22c55e'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ctx.parsed.y + '°C'
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 10, font: { size: 9 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        display: true,
                        ticks: { color: 'rgba(255,255,255,0.5)', callback: (v) => v + '°C', font: { size: 9 } },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        min: 0,
                        max: 45
                    }
                },
                animation: { duration: 300 }
            }
        });
        console.log('✅ Dashboard chart initialized');
    },

    updateChart(temp, timestamp) {
        if (!this.chartInstance) {
            this.initChart();
            if (!this.chartInstance) return;
        }

        const time = new Date(timestamp || Date.now()).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const chart = this.chartInstance;
        chart.data.labels.push(time);
        chart.data.datasets[0].data.push(Math.round(temp * 10) / 10);

        if (chart.data.labels.length > 15) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }

        chart.update('none');
        this.updateStability(chart.data.datasets[0].data);
    },

    updateStability(data) {
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
    },

    async loadHistory() {
        try {
            console.log('📊 Dashboard.loadHistory()');
            const snapshot = await get(ref(db, 'sensor'));
            const data = snapshot.val();
            if (!data) {
                console.log('⚠️ Tidak ada data sensor untuk dashboard');
                return;
            }

            const keys = Object.keys(data).sort().slice(-15);
            const temps = [];
            const labels = [];

            keys.forEach(key => {
                const val = data[key];
                const temp = val.suhu || val.temperature || 0;
                if (temp > 0 && temp < 60) {
                    temps.push(Math.round(temp * 10) / 10);
                    labels.push(new Date(val.timestamp || Date.now()).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit'
                    }));
                }
            });

            if (temps.length > 0 && this.chartInstance) {
                this.chartInstance.data.labels = labels;
                this.chartInstance.data.datasets[0].data = temps;
                this.chartInstance.update();
                this.updateStability(temps);
                console.log(`✅ Dashboard chart loaded: ${temps.length} data`);
            }
        } catch (e) {
            console.error('❌ Dashboard.loadHistory error:', e);
        }
    },

    updateCards(temp, lux, lampState) {
        requestAnimationFrame(() => {
            // Card 1: Suhu
            const tempVal = document.getElementById('dashTempValue');
            const tempStatus = document.getElementById('dashTempStatus');
            if (tempVal) tempVal.textContent = temp.toFixed(1);

            let category = '🌤️ Normal', color = '#22c55e';
            if (temp > 35) { category = '🔥 Sangat Panas'; color = '#ef4444'; }
            else if (temp > 30) { category = '🔥 Panas'; color = '#f59e0b'; }
            else if (temp < 20) { category = '❄️ Dingin'; color = '#3b82f6'; }
            if (tempStatus) { tempStatus.textContent = category; tempStatus.style.color = color; }

            // Card 2: Cahaya
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

            // Card 3: Status Lampu
            const lampStatus = document.getElementById('dashLampStatus');
            const lampText = document.getElementById('dashLampStatusText');
            const statusText = lampState ? 'ON' : 'OFF';
            const statusColor = lampState ? '#22c55e' : '#ef4444';
            const statusLabel = lampState ? '💡 Lampu Menyala' : '⛔ Lampu Mati';
            if (lampStatus) { lampStatus.textContent = statusText; lampStatus.style.color = statusColor; }
            if (lampText) { lampText.textContent = statusLabel; lampText.style.color = statusColor; }

            // Card 4: Pemenuhan Cahaya
            const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
            const display = progress > 100 ? 100 : progress;
            const progVal = document.getElementById('dashProgressValue');
            const progStatus = document.getElementById('dashProgressStatus');
            const sunHours = document.getElementById('dashSunlightHours');
            if (progVal) progVal.textContent = display + '%';
            if (progStatus) progStatus.textContent = `📊 ${(state.accumulatedLight || 0).toFixed(1)} dari ${state.totalLightNeeded || 12} jam`;
            if (sunHours) sunHours.textContent = (state.accumulatedLight || 0).toFixed(1);

            const modeDisplay = document.getElementById('dashModeDisplay');
            if (modeDisplay) {
                const labels = { otomatis: '🤖 Otomatis', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
                modeDisplay.textContent = labels[state.controlMode] || '🤖 Otomatis';
            }

            const connStatus = document.getElementById('dashConnStatus');
            if (connStatus) { connStatus.textContent = '● Online'; connStatus.className = 'status-badge online'; }

            const dataCount = document.getElementById('dashDataCount');
            if (dataCount) dataCount.textContent = state.sensorCount || 0;

            const lastUpdate = document.getElementById('dashLastUpdate');
            if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });

            const latestTemp = document.getElementById('dashLatestTemp');
            if (latestTemp) latestTemp.textContent = temp.toFixed(1) + '°C';
        });
    }
};

// ============================================
// 🟢 SECTION 2: MONITORING
// ============================================
const Monitoring = {
    lastUpdate: 0,
    throttle: 500,

    updateUI(temp, lux, lampState) {
        const now = Date.now();
        if (now - this.lastUpdate < this.throttle) return;
        this.lastUpdate = now;

        requestAnimationFrame(() => {
            const el = document.getElementById('monitorTemp');
            const status = document.getElementById('tempStatus');
            if (el) el.textContent = temp.toFixed(1);

            let category = '🌤️ Normal', color = '#22c55e';
            if (temp > 35) { category = '🔥 Sangat Panas'; color = '#ef4444'; }
            else if (temp > 30) { category = '🔥 Panas'; color = '#f59e0b'; }
            else if (temp < 20) { category = '❄️ Dingin'; color = '#3b82f6'; }
            if (status) { status.textContent = category; status.style.color = color; }

            const lightEl = document.getElementById('monitorLight');
            const lightStatus = document.getElementById('lightStatus');
            if (lightEl) lightEl.textContent = Math.round(lux);

            let lCat = '🌤️ Sedang', lColor = '#94a3b8';
            if (lux > 4000) { lCat = '☀️ Sangat Terang'; lColor = '#facc15'; }
            else if (lux > 2000) { lCat = '🌤️ Terang'; lColor = '#f59e0b'; }
            else if (lux > 500) { lCat = '🌥️ Sedang'; lColor = '#94a3b8'; }
            else if (lux > 100) { lCat = '🌥️ Redup'; lColor = '#64748b'; }
            else { lCat = '🌙 Gelap'; lColor = '#3b82f6'; }
            if (lightStatus) { lightStatus.textContent = lCat; lightStatus.style.color = lColor; }

            const lampStatus = document.getElementById('monitorLampStatus');
            const lampText = document.getElementById('lampStatusText');
            const statusText = lampState ? 'ON' : 'OFF';
            const statusColor = lampState ? '#22c55e' : '#ef4444';
            const statusLabel = lampState ? '💡 Lampu Menyala' : '⛔ Lampu Mati';
            if (lampStatus) { lampStatus.textContent = statusText; lampStatus.style.color = statusColor; }
            if (lampText) { lampText.textContent = statusLabel; lampText.style.color = statusColor; }
        });
    },

    updateQuickStats(temp, lux) {
        const tempStatus = document.getElementById('statTempStatus');
        if (tempStatus) {
            let category = 'Normal', color = '#22c55e';
            if (temp > 35) { category = 'Sangat Panas'; color = '#ef4444'; }
            else if (temp > 30) { category = 'Panas'; color = '#f59e0b'; }
            else if (temp < 20) { category = 'Dingin'; color = '#3b82f6'; }
            tempStatus.textContent = category;
            tempStatus.style.color = color;
        }

        const lightStatus = document.getElementById('statLightStatus');
        if (lightStatus) {
            let category = 'Sedang', color = '#94a3b8';
            if (lux > 4000) { category = 'Sangat Terang'; color = '#facc15'; }
            else if (lux > 2000) { category = 'Terang'; color = '#f59e0b'; }
            else if (lux > 500) { category = 'Sedang'; color = '#94a3b8'; }
            else if (lux > 100) { category = 'Redup'; color = '#64748b'; }
            else { category = 'Gelap'; color = '#3b82f6'; }
            lightStatus.textContent = category;
            lightStatus.style.color = color;
        }

        const statLamp = document.getElementById('statLamp');
        if (statLamp) {
            const state = this._lampState || false;
            statLamp.textContent = state ? 'ON' : 'OFF';
            statLamp.style.color = state ? '#22c55e' : '#ef4444';
        }
    },

    setLampState(state) {
        this._lampState = state;
    }
};

// ============================================
// 🟡 SECTION 3: GAUGE CHART
// ============================================
const Gauge = {
    instance: null,

    init() {
        console.log('📊 Gauge.init()');
        const canvas = document.getElementById('gaugeChart');
        if (!canvas) return;

        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }

        if (this.instance) {
            this.instance.destroy();
            this.instance = null;
        }

        const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
        const ctx = canvas.getContext('2d');
        this.instance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [progress, 100 - progress],
                    backgroundColor: ['#22c55e', 'rgba(255,255,255,0.1)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                cutout: '75%',
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            }
        });
    },

    update() {
        const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
        const display = progress > 100 ? 100 : progress;

        const el = document.getElementById('gaugeProgress');
        if (el) el.textContent = display + '%';

        const sun = document.getElementById('gaugeSunlight');
        if (sun) sun.textContent = (state.accumulatedLight || 0).toFixed(1);

        const grow = document.getElementById('gaugeGrowlight');
        if (grow) {
            const val = Math.max(0, (state.totalLightNeeded || 12) - (state.accumulatedLight || 0));
            grow.textContent = val.toFixed(1);
        }

        if (this.instance) {
            this.instance.data.datasets[0].data = [display, 100 - display];
            this.instance.update();
        }
    }
};

// ============================================
// 🟠 SECTION 4: CONTROL
// ============================================
const Control = {
    init() {
        console.log('🎛 Control.init()');
        
        document.getElementById('modeAutoBtn')?.addEventListener('click', () => this.setMode('otomatis'));
        document.getElementById('modeJadwalBtn')?.addEventListener('click', () => this.setMode('jadwal'));
        document.getElementById('modeManualBtn')?.addEventListener('click', () => this.setMode('manual'));

        document.getElementById('btnOn')?.addEventListener('click', () => this.setLamp(true));
        document.getElementById('btnOff')?.addEventListener('click', () => this.setLamp(false));

        document.getElementById('saveLightNeededBtn')?.addEventListener('click', () => this.saveLightNeeded());
        document.getElementById('saveJadwalBtn')?.addEventListener('click', () => this.saveJadwal());

        document.getElementById('forceDayOn')?.addEventListener('change', (e) => {
            const val = e.target.checked;
            set(ref(db, 'system/force_day_on'), val)
                .then(() => showToast(val ? '☀️ Force Day ON' : '🌙 Force Day OFF', 'info'))
                .catch(err => showToast('❌ ' + err.message, 'error'));
        });

        document.getElementById('resetPlantBtn')?.addEventListener('click', async () => {
            if (!confirm('🔄 Reset semua data tanam?')) return;
            try {
                await set(ref(db, 'system/plant_start_date'), null);
                showToast('✅ Tanaman di-reset!', 'success');
            } catch (e) { showToast('❌ ' + e.message, 'error'); }
        });
    },

    setMode(mode) {
        console.log('🔄 Set mode:', mode);
        set(ref(db, 'system/mode'), mode)
            .then(() => {
                state.controlMode = mode;
                this.updateUI(mode);
                showToast(`✅ Mode ${mode} aktif`, 'success');
            })
            .catch(err => showToast('❌ ' + err.message, 'error'));
    },

    setLamp(state) {
        console.log('🔄 Set lamp:', state);
        set(ref(db, 'system/state'), state)
            .then(() => showToast(`✅ Lamp ${state ? 'ON' : 'OFF'}`, 'success'))
            .catch(err => showToast('❌ ' + err.message, 'error'));
    },

    saveLightNeeded() {
        const val = parseInt(document.getElementById('totalLightNeeded')?.value || 12);
        if (val < 6 || val > 18) { showToast('❌ Harus 6-18 jam', 'error'); return; }
        set(ref(db, 'system/total_light_needed'), val)
            .then(() => { state.totalLightNeeded = val; showToast('✅ Disimpan!', 'success'); })
            .catch(err => showToast('❌ ' + err.message, 'error'));
    },

    saveJadwal() {
        const start = parseInt(document.getElementById('jadwalStart')?.value || 6);
        const end = parseInt(document.getElementById('jadwalEnd')?.value || 18);
        if (isNaN(start) || isNaN(end) || start < 0 || start > 23 || end < 0 || end > 23 || start >= end) {
            showToast('❌ Jam tidak valid', 'error');
            return;
        }
        set(ref(db, 'system/jadwal_start'), start);
        set(ref(db, 'system/jadwal_end'), end)
            .then(() => showToast(`✅ Jadwal ${start}:00 - ${end}:00`, 'success'))
            .catch(err => showToast('❌ ' + err.message, 'error'));
    },

    updateUI(mode) {
        const labels = { otomatis: '🤖 Otomatis', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
        ['currentModeDisplay', 'currentModeDisplayControl'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = labels[mode] || mode;
        });

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.style.background = 'rgba(255,255,255,0.05)';
            btn.style.border = '1px solid rgba(255,255,255,0.1)';
            btn.style.color = 'white';
        });
        const map = { otomatis: 'modeAutoBtn', jadwal: 'modeJadwalBtn', manual: 'modeManualBtn' };
        const active = document.getElementById(map[mode]);
        if (active) {
            active.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
            active.style.border = '1px solid #22c55e';
            active.style.color = 'white';
        }
    }
};

// ============================================
// 🔴 SECTION 5: FIREBASE LISTENERS
// ============================================
let unsubSensor = null;
let unsubSystem = null;
let isListenerActive = false;
let lastSensorUpdate = 0;
const SENSOR_THROTTLE = 10000; // ⭐ 10 DETIK (HEMAT)
let lastSystemUpdate = 0;
const SYSTEM_THROTTLE = 5000;

function initFirebase() {
    if (isListenerActive) {
        console.log('⚠️ Listener sudah aktif');
        return;
    }
    isListenerActive = true;
    console.log('🔌 Memasang Firebase listeners...');

    unsubSensor = onValue(ref(db, 'sensor'), (snap) => {
        try {
            const now = Date.now();
            if (now - lastSensorUpdate < SENSOR_THROTTLE) return;
            lastSensorUpdate = now;

            const d = snap.val();
            if (d) {
                const rawSuhu = d.suhu || 0;
                const rawLux = d.cahaya || 0;
                const validSuhu = (rawSuhu > 0 && rawSuhu < 60) ? rawSuhu : 25;
                const validLux = (rawLux >= 0 && rawLux < 10000) ? rawLux : 0;

                const smoothSuhu = suhuFilter.add(validSuhu);
                const smoothLux = luxFilter.add(validLux);

                state.temperature = smoothSuhu;
                state.sensorLight = smoothLux;

                Dashboard.updateCards(smoothSuhu, smoothLux, state.lampState);
                Dashboard.updateChart(smoothSuhu, d.timestamp || Date.now());

                Monitoring.updateUI(smoothSuhu, smoothLux, state.lampState);
                Monitoring.updateQuickStats(smoothSuhu, smoothLux);

                const statTemp = document.getElementById('statTemp');
                const statLight = document.getElementById('statLight');
                if (statTemp) statTemp.textContent = smoothSuhu.toFixed(1);
                if (statLight) statLight.textContent = Math.round(smoothLux);

                const lastUpdate = document.getElementById('dashLastUpdate');
                if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
            }
        } catch (e) {
            console.error('❌ Sensor listener error:', e);
        }
    }, (err) => {
        console.error('❌ Sensor error:', err);
        isListenerActive = false;
    });

    unsubSystem = onValue(ref(db, 'system'), (snap) => {
        try {
            const now = Date.now();
            if (now - lastSystemUpdate < SYSTEM_THROTTLE) return;
            lastSystemUpdate = now;

            const d = snap.val();
            if (d) {
                state.controlMode = d.mode || 'otomatis';
                if (!['otomatis', 'jadwal', 'manual'].includes(state.controlMode)) {
                    state.controlMode = 'otomatis';
                }

                state.lampState = d.actual_state || false;
                state.forceDayOn = d.force_day_on || false;
                state.jadwalStart = d.jadwal_start || 6;
                state.jadwalEnd = d.jadwal_end || 18;
                state.totalLightNeeded = d.total_light_needed || 12;
                state.accumulatedLight = d.accumulated_light || 0;
                state.lastResetDate = d.last_reset_date || '';

                const today = getTodayKey();
                if (state.lastResetDate !== today) {
                    state.accumulatedLight = 0;
                    state.lastResetDate = today;
                }

                Dashboard.updateCards(state.temperature, state.sensorLight, state.lampState);
                Gauge.update();
                Control.updateUI(state.controlMode);

                const statusText = state.lampState ? 'ON' : 'OFF';
                const statusColor = state.lampState ? '#22c55e' : '#ef4444';
                ['lampStateText', 'statLamp'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) { el.textContent = statusText; el.style.color = statusColor; }
                });

                const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
                const display = progress > 100 ? 100 : progress;
                const statProgress = document.getElementById('statLightProgress');
                const lightProgress = document.getElementById('lightProgressDisplay');
                const sunlight = document.getElementById('sunlightHours');
                if (statProgress) statProgress.textContent = display;
                if (lightProgress) lightProgress.textContent = display + '%';
                if (sunlight) sunlight.textContent = (state.accumulatedLight || 0).toFixed(1);

                updateDailyHistory();
            }
        } catch (e) {
            console.error('❌ System listener error:', e);
        }
    }, (err) => {
        console.error('❌ System error:', err);
        isListenerActive = false;
    });

    const connStatus = document.getElementById('connStatus');
    if (connStatus) {
        connStatus.innerText = 'Realtime Connected';
        connStatus.style.color = '#22c55e';
    }
}

// ============================================
// 📊 SECTION 6: DAILY HISTORY
// ============================================
async function updateDailyHistory() {
    try {
        const today = getTodayKey();
        const snap = await get(ref(db, 'system'));
        const system = snap.val();
        if (!system) return;

        const accumulatedLight = system.accumulated_light || 0;
        const totalNeeded = system.total_light_needed || 12;
        const actualState = system.actual_state || false;

        await update(ref(db, `daily_history/${today}`), {
            growlight: accumulatedLight,
            total: totalNeeded,
            status: actualState ? 'ON' : 'OFF',
            updatedAt: Date.now()
        });

        const onTime = document.getElementById('lampOnTime');
        const offTime = document.getElementById('lampOffTime');
        if (onTime) onTime.textContent = accumulatedLight.toFixed(1) + ' jam';
        if (offTime) offTime.textContent = (24 - accumulatedLight).toFixed(1) + ' jam';

        const onPct = Math.min((accumulatedLight / 24) * 100, 100);
        const offPct = 100 - onPct;
        const onBar = document.getElementById('lampOnBar');
        const offBar = document.getElementById('lampOffBar');
        if (onBar) onBar.style.width = onPct + '%';
        if (offBar) offBar.style.width = offPct + '%';

        const onPctEl = document.getElementById('onPercent');
        const offPctEl = document.getElementById('offPercent');
        if (onPctEl) onPctEl.textContent = 'ON: ' + Math.round(onPct) + '%';
        if (offPctEl) offPctEl.textContent = 'OFF: ' + Math.round(offPct) + '%';
    } catch (e) {
        console.error('❌ updateDailyHistory error:', e);
    }
}

// ============================================
// 🧭 SECTION 7: NAVIGATION
// ============================================
function setupNavigation() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
            this.classList.add('active');

            const target = this.dataset.target;
            document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
            const section = document.getElementById(target);
            if (section) section.classList.remove('hidden');

            if (window.innerWidth <= 768) closeMenu();
        });
    });
}

// ============================================
// 📱 SECTION 8: SIDEBAR (MOBILE FRIENDLY)
// ============================================
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('mobileOverlay');

function closeMenu() {
    sidebar?.classList.remove('active');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
}

if (menuToggle) {
    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    });
    
    menuToggle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    }, { passive: false });
}

if (overlay) {
    overlay.addEventListener('click', closeMenu);
    overlay.addEventListener('touchstart', (e) => { e.preventDefault(); closeMenu(); }, { passive: false });
}

window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeMenu();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
});

// ============================================
// 🕐 SECTION 9: CLOCK
// ============================================
function updateClock() {
    const now = new Date();
    const dateEl = document.getElementById('dateText');
    const clockEl = document.getElementById('clockText');
    if (dateEl) {
        dateEl.innerText = now.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
    if (clockEl) {
        clockEl.innerText = now.toLocaleTimeString('id-ID');
    }
}

// ============================================
// 🚀 SECTION 10: APP START
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    console.log('📄 DOMContentLoaded fired!');
    try {
        initDOM();
        initAdminPanel();
        
        // ⭐ INIT CHARTS (dari analytics.js)
        console.log('📊 Panggil initCharts...');
        initCharts();

        // ⭐ LOAD ALL HISTORY (INI YANG SELAMA INI MISSING!)
        setTimeout(() => {
            console.log('📊 Load chart history from Firebase...');
            loadChartHistory();
            loadDashChartHistory();
            loadDailyHistory();
        }, 500);

        // ⭐ Dashboard
        Dashboard.initChart();
        setTimeout(() => Dashboard.loadHistory(), 500);

        // ⭐ Gauge
        setTimeout(() => Gauge.init(), 500);

        // ⭐ Control
        Control.init();
        
        // ⭐ Firebase
        initFirebase();
        
        // ⭐ Navigation
        setupNavigation();

        // ⭐ Expand Chart
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

        // ⭐ Clock
        updateClock();
        setInterval(updateClock, 1000);

        // ⭐ User name
        if (DOM.userName) {
            DOM.userName.textContent = `👋 ${currentUser?.nama || 'User'}`;
        }

        // ⭐ Periodik update
        setInterval(() => {
            const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
            const display = progress > 100 ? 100 : progress;
            
            const dashProgress = document.getElementById('dashProgressValue');
            const gaugeProgress = document.getElementById('gaugeProgress');
            const statProgress = document.getElementById('statLightProgress');
            
            if (dashProgress) dashProgress.textContent = display + '%';
            if (gaugeProgress) gaugeProgress.textContent = display + '%';
            if (statProgress) statProgress.textContent = display;
        }, 10000);

        // ⭐ Default section
        const defaultSection = document.getElementById('dashboard');
        if (defaultSection) {
            document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
            defaultSection.classList.remove('hidden');
        }

        console.log("🚀 App siap!");
    } catch (e) {
        console.error('❌ Error start app:', e);
    }
});

console.log('✅ app.js fully loaded (FIXED - chart load)');
