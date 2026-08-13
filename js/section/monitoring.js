// ============================================
// MONITORING SECTION
// ============================================

import { state } from '../firebase.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

let gaugeInstance = null;
let unsubSensor = null;
let unsubSystem = null;

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

const Monitoring = {
    lastUpdate: 0,
    throttle: 500,
    updateUI(temp, lux, lampState, humidity) {
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

            const humEl = document.getElementById('monitorHumidity');
            const humStatus = document.getElementById('humidityStatus');
            if (humEl) humEl.textContent = humidity.toFixed(1);
            let humCategory = '🌤️ Normal', humColor = '#22c55e';
            if (humidity > 80) { humCategory = '💧 Sangat Lembab'; humColor = '#3b82f6'; }
            else if (humidity > 70) { humCategory = '💧 Lembab'; humColor = '#60a5fa'; }
            else if (humidity < 40) { humCategory = '🔥 Kering'; humColor = '#f59e0b'; }
            else if (humidity < 30) { humCategory = '🔥 Sangat Kering'; humColor = '#ef4444'; }
            if (humStatus) { humStatus.textContent = humCategory; humStatus.style.color = humColor; }

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
    }
};

export function initMonitoring() {
    console.log('🌡 Monitoring init');
    setTimeout(() => Gauge.init(), 500);
    unsubSensor = onValue(ref(db, 'sensor'), (snap) => {
        try {
            const d = snap.val();
            if (!d) return;
            Monitoring.updateUI(d.suhu || 0, d.cahaya || 0, state.lampState, d.kelembapan || 0);
        } catch (e) { console.error('❌ Monitoring error:', e); }
    });
    unsubSystem = onValue(ref(db, 'system'), (snap) => {
        try {
            const d = snap.val();
            if (!d) return;
            state.lampState = d.actual_state || false;
            state.accumulatedLight = d.accumulated_light || 0;
            state.totalLightNeeded = d.total_light_needed || 12;
            Gauge.update();
        } catch (e) { console.error('❌ Monitoring error:', e); }
    });
}

export function cleanupMonitoring() {
    if (unsubSensor) { unsubSensor(); unsubSensor = null; }
    if (unsubSystem) { unsubSystem(); unsubSystem = null; }
    if (Gauge.instance) { Gauge.instance.destroy(); Gauge.instance = null; }
}
