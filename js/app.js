// ============================================
// DASHBOARD SECTION
// ============================================

import { db, state } from './js/firebase.js';  
import { ref, onValue, get, query, orderByKey, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const Dashboard = {
    updateCards(temp, lux, lampState, humidity) {
        requestAnimationFrame(() => {
            const tempVal = document.getElementById('dashTempValue');
            const tempStatus = document.getElementById('dashTempStatus');
            if (tempVal) tempVal.textContent = temp.toFixed(1);
            let category = '🌤️ Normal', color = '#22c55e';
            if (temp > 35) { category = '🔥 Sangat Panas'; color = '#ef4444'; }
            else if (temp > 30) { category = '🔥 Panas'; color = '#f59e0b'; }
            else if (temp < 20) { category = '❄️ Dingin'; color = '#3b82f6'; }
            if (tempStatus) { tempStatus.textContent = category; tempStatus.style.color = color; }

            const humVal = document.getElementById('dashHumidityValue');
            const humStatus = document.getElementById('dashHumidityStatus');
            if (humVal) humVal.textContent = humidity.toFixed(1);
            let humCategory = '🌤️ Normal', humColor = '#22c55e';
            if (humidity > 80) { humCategory = '💧 Sangat Lembab'; humColor = '#3b82f6'; }
            else if (humidity > 70) { humCategory = '💧 Lembab'; humColor = '#60a5fa'; }
            else if (humidity < 40) { humCategory = '🔥 Kering'; humColor = '#f59e0b'; }
            else if (humidity < 30) { humCategory = '🔥 Sangat Kering'; humColor = '#ef4444'; }
            if (humStatus) { humStatus.textContent = humCategory; humStatus.style.color = humColor; }

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

            const lampDuration = document.getElementById('dashLampDuration');
            const lampText = document.getElementById('dashLampStatusText');
            const accumulatedLight = state.accumulatedLight || 0;
            if (lampDuration) lampDuration.textContent = accumulatedLight.toFixed(1);
            const statusText = lampState ? 'ON' : 'OFF';
            const statusColor = lampState ? '#22c55e' : '#ef4444';
            const statusLabel = lampState ? '💡 Lampu Menyala' : '⛔ Lampu Mati';
            if (lampText) { lampText.textContent = statusLabel; lampText.style.color = statusColor; }

            const modeDisplay = document.getElementById('dashModeDisplay');
            if (modeDisplay) {
                const labels = { otomatis: '🤖 Otomatis', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
                modeDisplay.textContent = labels[state.controlMode] || '🤖 Otomatis';
            }

            const connStatus = document.getElementById('dashConnStatus');
            if (connStatus) { connStatus.textContent = '● Online'; connStatus.className = 'status-badge online'; }
            const lastUpdate = document.getElementById('dashLastUpdate');
            if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
            const latestTemp = document.getElementById('dashLatestTemp');
            if (latestTemp) latestTemp.textContent = temp.toFixed(1) + '°C';
        });
    }
};

let unsubSensor = null;
let unsubSystem = null;

export function initDashboard() {
    console.log('🏠 Dashboard init');
    unsubSensor = onValue(ref(db, 'sensor'), (snap) => {
        try {
            const d = snap.val();
            if (!d) return;
            Dashboard.updateCards(d.suhu || 0, d.cahaya || 0, state.lampState, d.kelembapan || 0);
        } catch (e) { console.error('❌ Dashboard error:', e); }
    });
    unsubSystem = onValue(ref(db, 'system'), (snap) => {
        try {
            const d = snap.val();
            if (!d) return;
            state.lampState = d.actual_state || false;
            state.accumulatedLight = d.accumulated_light || 0;
            state.controlMode = d.mode || 'otomatis';
            state.totalLightNeeded = d.total_light_needed || 12;
        } catch (e) { console.error('❌ Dashboard error:', e); }
    });
}

export function cleanupDashboard() {
    if (unsubSensor) { unsubSensor(); unsubSensor = null; }
    if (unsubSystem) { unsubSystem(); unsubSystem = null; }
}
