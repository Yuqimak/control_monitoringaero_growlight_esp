// ============================================
// MAIN ENTRY – app.js (FULLY INTEGRATED)
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
import { ref, onValue, set, update, get, query, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

console.log('🚀 app.js loaded');

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
        console.log('👤 Login:', user.nama);
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
const humFilter = new SmoothingFilter(5);

// ============================================
// FUNGSI BANTU
// ============================================
function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function parseFirebaseKeyToTimestamp(key) {
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
    } catch (e) {
        return 0;
    }
}

// ============================================
// 🔵 DASHBOARD (REVISI - 3 CARD + CHART 2 LINE)
// ============================================
const Dashboard = {
    // ⭐ UPDATE CARDS - 3 CARD (GABUNG)
    updateCards(temp, lux, lampState, humidity) {
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

            // ─── CARD 2: CAHAYA ───
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

            // ─── CARD 3: WAKTU OPERASIONAL + STATUS (GABUNG) ───
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
            if (connStatus) { connStatus.textContent = '● Online'; connStatus.className = 'status-badge online'; }

            const lastUpdate = document.getElementById('dashLastUpdate');
            if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });

            const latestTemp = document.getElementById('dashLatestTemp');
            if (latestTemp) latestTemp.textContent = temp.toFixed(1) + '°C';

            // ─── GROWLIGHT HOURS ───
            const sunlightHours = document.getElementById('dashSunlightHours');
            if (sunlightHours) sunlightHours.textContent = (state.accumulatedLight || 0).toFixed(1);
        });
    }
};

// ============================================
// 🟢 MONITORING
// ============================================
const Monitoring = {
    lastUpdate: 0,
    throttle: 500,

    updateUI(temp, lux, lampState, humidity) {
        const now = Date.now();
        if (now - this.lastUpdate < this.throttle) return;
        this.lastUpdate = now;

        requestAnimationFrame(() => {
            // SUHU
            const el = document.getElementById('monitorTemp');
            const status = document.getElementById('tempStatus');
            if (el) el.textContent = temp.toFixed(1);
            let category = '🌤️ Normal', color = '#22c55e';
            if (temp > 35) { category = '🔥 Sangat Panas'; color = '#ef4444'; }
            else if (temp > 30) { category = '🔥 Panas'; color = '#f59e0b'; }
            else if (temp < 20) { category = '❄️ Dingin'; color = '#3b82f6'; }
            if (status) { status.textContent = category; status.style.color = color; }

            // KELEMBAPAN
            const humEl = document.getElementById('monitorHumidity');
            const humStatus = document.getElementById('humidityStatus');
            if (humEl) humEl.textContent = humidity.toFixed(1);
            let humCategory = '🌤️ Normal', humColor = '#22c55e';
            if (humidity > 80) { humCategory = '💧 Sangat Lembab'; humColor = '#3b82f6'; }
            else if (humidity > 70) { humCategory = '💧 Lembab'; humColor = '#60a5fa'; }
            else if (humidity < 40) { humCategory = '🔥 Kering'; humColor = '#f59e0b'; }
            else if (humidity < 30) { humCategory = '🔥 Sangat Kering'; humColor = '#ef4444'; }
            if (humStatus) { humStatus.textContent = humCategory; humStatus.style.color = humColor; }

            // CAHAYA
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

            // STATUS LAMPU
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
// 🟡 GAUGE CHART
// ============================================
const Gauge = {
    instance: null,

    init() {
        const canvas = document.getElementById('gaugeChart');
        if (!canvas) return;
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();
        if (this.instance) { this.instance.destroy(); this.instance = null; }
        const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
        const ctx = canvas.getContext('2d');
        this.instance = new Chart(ctx, {
            type: 'doughnut',
            data: { datasets: [{ data: [progress, 100 - progress], backgroundColor: ['#22c55e', 'rgba(255,255,255,0.1)'], borderWidth: 0 }] },
            options: { responsive: true, cutout: '75%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }
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
// 🟠 CONTROL
// ============================================
const Control = {
    init() {
        document.getElementById('modeAutoBtn')?.addEventListener('click', () => this.setMode('otomatis'));
        document.getElementById('modeJadwalBtn')?.addEventListener('click', () => this.setMode('jadwal'));
        document.getElementById('modeManualBtn')?.addEventListener('click', () => this.setMode('manual'));
        document.getElementById('btnOn')?.addEventListener('click', () => this.setLamp(true));
        document.getElementById('btnOff')?.addEventListener('click', () => this.setLamp(false));
        document.getElementById('saveLightNeededBtn')?.addEventListener('click', () => this.saveLightNeeded());
        document.getElementById('saveJadwalBtn')?.addEventListener('click', () => this.saveJadwal());
        document.getElementById('forceDayOn')?.addEventListener('change', (e) => {
            set(ref(db, 'system/force_day_on'), e.target.checked)
                .then(() => showToast(e.target.checked ? '☀️ Force Day ON' : '🌙 Force Day OFF', 'info'))
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
        set(ref(db, 'system/mode'), mode)
            .then(() => { state.controlMode = mode; this.updateUI(mode); showToast(`✅ Mode ${mode} aktif`, 'success'); })
            .catch(err => showToast('❌ ' + err.message, 'error'));
    },

    setLamp(state) {
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
// 🔴 FIREBASE LISTENERS
// ============================================
let unsubSensor = null, unsubSystem = null, isListenerActive = false;
let lastSensorUpdate = 0, lastSystemUpdate = 0;
const SENSOR_THROTTLE = 10000, SYSTEM_THROTTLE = 5000;

function initFirebase() {
    if (isListenerActive) return;
    isListenerActive = true;
    console.log('🔌 Firebase listeners started');

    unsubSensor = onValue(ref(db, 'sensor'), (snap) => {
        try {
            const now = Date.now();
            if (now - lastSensorUpdate < SENSOR_THROTTLE) return;
            lastSensorUpdate = now;
            const d = snap.val();
            if (d) {
                const rawSuhu = d.suhu || 0;
                const rawLux = d.cahaya || 0;
                const rawHum = d.kelembapan || 0;
                
                const validSuhu = (rawSuhu > 0 && rawSuhu < 60) ? rawSuhu : 25;
                const validLux = (rawLux >= 0 && rawLux < 10000) ? rawLux : 0;
                const validHum = (rawHum >= 0 && rawHum <= 100) ? rawHum : 50;
                
                const smoothSuhu = suhuFilter.add(validSuhu);
                const smoothLux = luxFilter.add(validLux);
                const smoothHum = humFilter.add(validHum);
                
                state.temperature = smoothSuhu;
                state.sensorLight = smoothLux;
                state.humidity = smoothHum;
                
                Dashboard.updateCards(smoothSuhu, smoothLux, state.lampState, smoothHum);
                Monitoring.updateUI(smoothSuhu, smoothLux, state.lampState, smoothHum);
                Monitoring.updateQuickStats(smoothSuhu, smoothLux);
                
                const statTemp = document.getElementById('statTemp');
                const statLight = document.getElementById('statLight');
                if (statTemp) statTemp.textContent = smoothSuhu.toFixed(1);
                if (statLight) statLight.textContent = Math.round(smoothLux);
                
                const lastUpdate = document.getElementById('dashLastUpdate');
                if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
            }
        } catch (e) { console.error('❌ Sensor error:', e); }
    }, (err) => { console.error('❌ Sensor error:', err); isListenerActive = false; });

    unsubSystem = onValue(ref(db, 'system'), (snap) => {
        try {
            const now = Date.now();
            if (now - lastSystemUpdate < SYSTEM_THROTTLE) return;
            lastSystemUpdate = now;
            const d = snap.val();
            if (d) {
                state.controlMode = d.mode || 'otomatis';
                if (!['otomatis', 'jadwal', 'manual'].includes(state.controlMode)) state.controlMode = 'otomatis';
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
                
                Dashboard.updateCards(state.temperature, state.sensorLight, state.lampState, state.humidity);
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
        } catch (e) { console.error('❌ System error:', e); }
    }, (err) => { console.error('❌ System error:', err); isListenerActive = false; });

    const connStatus = document.getElementById('connStatus');
    if (connStatus) { connStatus.innerText = 'Realtime Connected'; connStatus.style.color = '#22c55e'; }
}

// ============================================
// 📊 DAILY HISTORY
// ============================================
async function updateDailyHistory() {
    try {
        const today = getTodayKey();
        const systemSnap = await get(ref(db, 'system'));
        const system = systemSnap.val() || {};
        let accumulatedLight = system.accumulated_light || 0;
        const target = system.total_light_needed || 12;
        const actualState = system.actual_state || false;

        if (accumulatedLight === 0) {
            const lampuSnap = await get(ref(db, 'sensor_history/lampu'));
            const lampuData = lampuSnap.val() || {};
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayStartTimestamp = todayStart.getTime();
            let tempLight = 0, lastTs = null, lastState = false;
            Object.keys(lampuData).sort().forEach(key => {
                const ts = parseFirebaseKeyToTimestamp(key);
                if (ts === 0 || ts < todayStartTimestamp) return;
                const entry = lampuData[key];
                const state = typeof entry === 'object' ? (entry.state === true || entry.state === 1 || entry.state === 'ON') : (entry === true || entry === 1 || entry === 'ON');
                if (lastTs !== null && lastState) tempLight += (ts - lastTs) / 3600000;
                lastTs = ts;
                lastState = state;
            });
            if (lastState && lastTs !== null) tempLight += (Date.now() - lastTs) / 3600000;
            accumulatedLight = tempLight;
        }

        let status = '🌙 Mati', statusColor = '#64748b';
        if (accumulatedLight >= target) { status = '✅ Cukup'; statusColor = '#22c55e'; }
        else if (accumulatedLight >= target * 0.5) { status = '🟡 Sedang'; statusColor = '#f59e0b'; }
        else if (accumulatedLight > 0) { status = '🔴 Kurang'; statusColor = '#ef4444'; }

        await update(ref(db, `daily_history/${today}`), {
            growlight: Math.round(accumulatedLight * 10) / 10,
            target: target,
            status: status,
            statusColor: statusColor,
            actualState: actualState,
            updatedAt: new Date().toLocaleString('id-ID')
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

    } catch (e) { console.error('❌ Daily history error:', e); }
}

// ============================================
// 🧭 NAVIGATION & SIDEBAR
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

const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('mobileOverlay');

function closeMenu() {
    sidebar?.classList.remove('active');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
}

if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    });
}
if (overlay) {
    overlay.addEventListener('click', closeMenu);
}
window.addEventListener('resize', () => { if (window.innerWidth > 768) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

// ============================================
// 🕐 CLOCK
// ============================================
function updateClock() {
    const now = new Date();
    const dateEl = document.getElementById('dateText');
    const clockEl = document.getElementById('clockText');
    if (dateEl) {
        dateEl.innerText = now.toLocaleDateString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }
    if (clockEl) {
        clockEl.innerText = now.toLocaleTimeString('id-ID');
    }
}

// ============================================
// 🚀 APP START
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    console.log('📄 App starting...');
    try {
        initDOM();
        initAdminPanel();
        initCharts();

        setTimeout(() => {
            loadChartHistory();
            loadDailyHistory();
            setTimeout(() => { loadDashChartHistory(); }, 800);
        }, 500);

        setTimeout(() => Gauge.init(), 600);
        Control.init();
        initFirebase();
        setupNavigation();

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

        updateClock();
        setInterval(updateClock, 1000);

        if (DOM.userName) {
            DOM.userName.textContent = `👋 ${currentUser?.nama || 'User'}`;
        }

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

        const defaultSection = document.getElementById('dashboard');
        if (defaultSection) {
            document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
            defaultSection.classList.remove('hidden');
        }

        console.log("🚀 App ready!");
    } catch (e) {
        console.error('❌ Error start app:', e);
    }
});

console.log('✅ app.js loaded');
