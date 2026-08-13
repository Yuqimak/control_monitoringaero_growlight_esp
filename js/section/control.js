// ============================================
// CONTROL SECTION
// ============================================

import { db, state } from '../firebase.js';
import { ref, onValue, set, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { showToast } from '../modules/core.js';

let unsubSystem = null;

function setMode(mode) {
    set(ref(db, 'system/mode'), mode)
        .then(() => { state.controlMode = mode; updateUI(mode); showToast(`✅ Mode ${mode}`, 'success'); })
        .catch(err => showToast('❌ ' + err.message, 'error'));
}

function setLamp(stateVal) {
    set(ref(db, 'system/state'), stateVal)
        .then(() => {
            const lampText = document.getElementById('lampStateText');
            if (lampText) { lampText.textContent = stateVal ? 'ON' : 'OFF'; lampText.style.color = stateVal ? '#22c55e' : '#ef4444'; }
            showToast(`✅ Lamp ${stateVal ? 'ON' : 'OFF'}`, 'success');
        })
        .catch(err => showToast('❌ ' + err.message, 'error'));
}

function saveLightNeeded() {
    const input = document.getElementById('totalLightNeeded');
    if (!input) return;
    const val = parseInt(input.value) || 12;
    if (val < 6 || val > 18) { showToast('❌ Harus 6-18 jam', 'error'); return; }
    set(ref(db, 'system/total_light_needed'), val)
        .then(() => { state.totalLightNeeded = val; showToast('✅ Target: ' + val + ' jam', 'success'); })
        .catch(err => showToast('❌ ' + err.message, 'error'));
}

function saveJadwal() {
    const startInput = document.getElementById('jadwalStart');
    const endInput = document.getElementById('jadwalEnd');
    if (!startInput || !endInput) return;
    const start = parseInt(startInput.value) || 6;
    const end = parseInt(endInput.value) || 18;
    if (isNaN(start) || isNaN(end) || start < 0 || start > 23 || end < 0 || end > 23 || start >= end) {
        showToast('❌ Jam tidak valid', 'error');
        return;
    }
    Promise.all([
        set(ref(db, 'system/jadwal_start'), start),
        set(ref(db, 'system/jadwal_end'), end)
    ]).then(() => showToast(`✅ Jadwal ${start}:00 - ${end}:00`, 'success'))
      .catch(err => showToast('❌ ' + err.message, 'error'));
}

function toggleForceDayOn(e) {
    const val = e.target.checked;
    set(ref(db, 'system/force_day_on'), val)
        .then(() => showToast(val ? '☀️ Force Day ON' : '🌙 Force Day OFF', 'info'))
        .catch(err => showToast('❌ ' + err.message, 'error'));
}

async function resetPlant() {
    if (!confirm('🔄 Reset semua data tanam?')) return;
    try {
        await set(ref(db, 'system/plant_start_date'), null);
        showToast('✅ Reset berhasil!', 'success');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

function updateUI(mode) {
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

function updateLampUI(lampState) {
    const statusText = lampState ? 'ON' : 'OFF';
    const statusColor = lampState ? '#22c55e' : '#ef4444';
    ['lampStateText', 'statLamp'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = statusText; el.style.color = statusColor; }
    });
}

export function initControl() {
    console.log('🎛 Control init');
    document.getElementById('modeAutoBtn')?.addEventListener('click', () => setMode('otomatis'));
    document.getElementById('modeJadwalBtn')?.addEventListener('click', () => setMode('jadwal'));
    document.getElementById('modeManualBtn')?.addEventListener('click', () => setMode('manual'));
    document.getElementById('btnOn')?.addEventListener('click', () => setLamp(true));
    document.getElementById('btnOff')?.addEventListener('click', () => setLamp(false));
    document.getElementById('saveLightNeededBtn')?.addEventListener('click', saveLightNeeded);
    document.getElementById('saveJadwalBtn')?.addEventListener('click', saveJadwal);
    document.getElementById('forceDayOn')?.addEventListener('change', toggleForceDayOn);
    document.getElementById('resetPlantBtn')?.addEventListener('click', resetPlant);

    unsubSystem = onValue(ref(db, 'system'), (snap) => {
        try {
            const d = snap.val();
            if (!d) return;
            state.controlMode = d.mode || 'otomatis';
            state.lampState = d.actual_state || false;
            state.forceDayOn = d.force_day_on || false;
            state.jadwalStart = d.jadwal_start || 6;
            state.jadwalEnd = d.jadwal_end || 18;
            state.totalLightNeeded = d.total_light_needed || 12;
            state.accumulatedLight = d.accumulated_light || 0;
            updateUI(state.controlMode);
            updateLampUI(state.lampState);
            const totalInput = document.getElementById('totalLightNeeded');
            if (totalInput) totalInput.value = state.totalLightNeeded;
            const startInput = document.getElementById('jadwalStart');
            if (startInput) startInput.value = state.jadwalStart;
            const endInput = document.getElementById('jadwalEnd');
            if (endInput) endInput.value = state.jadwalEnd;
            const forceCheck = document.getElementById('forceDayOn');
            if (forceCheck) forceCheck.checked = state.forceDayOn;
            const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
            const display = progress > 100 ? 100 : progress;
            const lightProgress = document.getElementById('lightProgressDisplay');
            if (lightProgress) lightProgress.textContent = display + '%';
            const sunlight = document.getElementById('sunlightHours');
            if (sunlight) sunlight.textContent = (state.accumulatedLight || 0).toFixed(1);
        } catch (e) { console.error('❌ Control error:', e); }
    });

    get(ref(db, 'system')).then((snap) => {
        const d = snap.val();
        if (d) {
            const totalInput = document.getElementById('totalLightNeeded');
            if (totalInput && d.total_light_needed) totalInput.value = d.total_light_needed;
            const startInput = document.getElementById('jadwalStart');
            if (startInput && d.jadwal_start) startInput.value = d.jadwal_start;
            const endInput = document.getElementById('jadwalEnd');
            if (endInput && d.jadwal_end) endInput.value = d.jadwal_end;
            const forceCheck = document.getElementById('forceDayOn');
            if (forceCheck && d.force_day_on !== undefined) forceCheck.checked = d.force_day_on;
            if (d.mode) updateUI(d.mode);
            if (d.actual_state !== undefined) updateLampUI(d.actual_state);
        }
    }).catch(err => console.error('❌ Load state error:', err));
}

export function cleanupControl() {
    if (unsubSystem) { unsubSystem(); unsubSystem = null; }
}
