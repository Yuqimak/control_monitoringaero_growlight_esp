// ============================================
// 🎛 CONTROL SECTION - INDEPENDENT
// ============================================

import { db, state } from '../firebase.js';
import { ref, onValue, set, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { showToast } from '../modules/core.js';

console.log('🎛 control.js loaded');

// ============================================
// CONTROL STATE
// ============================================
const ControlState = {
    mode: 'otomatis',
    manualState: false,
    forceDayOn: false,
    jadwalStart: 6,
    jadwalEnd: 18,
    totalLightNeeded: 12
};

// ============================================
// 1. SET MODE
// ============================================
function setMode(mode) {
    console.log('🔄 Set mode:', mode);
    set(ref(db, 'system/mode'), mode)
        .then(() => {
            state.controlMode = mode;
            ControlState.mode = mode;
            updateModeUI(mode);
            showToast(`✅ Mode ${mode} aktif`, 'success');
        })
        .catch(err => showToast('❌ ' + err.message, 'error'));
}

// ============================================
// 2. SET LAMP (ON/OFF) - MANUAL
// ============================================
function setLamp(stateValue) {
    console.log('🔄 Set lamp:', stateValue);
    set(ref(db, 'system/state'), stateValue)
        .then(() => {
            // Update UI langsung
            const lampText = document.getElementById('lampStateText');
            if (lampText) {
                lampText.textContent = stateValue ? 'ON' : 'OFF';
                lampText.style.color = stateValue ? '#22c55e' : '#ef4444';
            }
            showToast(`✅ Lamp ${stateValue ? 'ON' : 'OFF'}`, 'success');
        })
        .catch(err => showToast('❌ ' + err.message, 'error'));
}

// ============================================
// 3. SAVE LIGHT NEEDED (TARGET)
// ============================================
function saveLightNeeded() {
    const input = document.getElementById('totalLightNeeded');
    if (!input) return;
    const val = parseInt(input.value) || 12;
    if (val < 6 || val > 18) {
        showToast('❌ Harus 6-18 jam', 'error');
        return;
    }
    set(ref(db, 'system/total_light_needed'), val)
        .then(() => {
            state.totalLightNeeded = val;
            ControlState.totalLightNeeded = val;
            showToast('✅ Target disimpan: ' + val + ' jam', 'success');
        })
        .catch(err => showToast('❌ ' + err.message, 'error'));
}

// ============================================
// 4. SAVE JADWAL
// ============================================
function saveJadwal() {
    const startInput = document.getElementById('jadwalStart');
    const endInput = document.getElementById('jadwalEnd');
    if (!startInput || !endInput) return;
    
    const start = parseInt(startInput.value) || 6;
    const end = parseInt(endInput.value) || 18;
    
    if (isNaN(start) || isNaN(end) || start < 0 || start > 23 || end < 0 || end > 23 || start >= end) {
        showToast('❌ Jam tidak valid (0-23, mulai < selesai)', 'error');
        return;
    }
    
    Promise.all([
        set(ref(db, 'system/jadwal_start'), start),
        set(ref(db, 'system/jadwal_end'), end)
    ])
        .then(() => {
            ControlState.jadwalStart = start;
            ControlState.jadwalEnd = end;
            showToast(`✅ Jadwal ${start}:00 - ${end}:00`, 'success');
        })
        .catch(err => showToast('❌ ' + err.message, 'error'));
}

// ============================================
// 5. FORCE DAY ON
// ============================================
function toggleForceDayOn(e) {
    const val = e.target.checked;
    set(ref(db, 'system/force_day_on'), val)
        .then(() => {
            ControlState.forceDayOn = val;
            showToast(val ? '☀️ Force Day ON aktif' : '🌙 Force Day OFF', 'info');
        })
        .catch(err => showToast('❌ ' + err.message, 'error'));
}

// ============================================
// 6. RESET PLANT
// ============================================
async function resetPlant() {
    if (!confirm('🔄 Reset semua data tanam? Yakin?')) return;
    try {
        await set(ref(db, 'system/plant_start_date'), null);
        showToast('✅ Tanaman di-reset!', 'success');
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    }
}

// ============================================
// 7. UPDATE UI MODE (Highlight Button)
// ============================================
function updateModeUI(mode) {
    const labels = {
        otomatis: '🤖 Otomatis',
        jadwal: '⏰ Jadwal',
        manual: '👋 Manual'
    };
    
    // Update text display
    ['currentModeDisplay', 'currentModeDisplayControl'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = labels[mode] || mode;
    });

    // Update buttons
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

// ============================================
// 8. UPDATE LAMP STATUS UI
// ============================================
function updateLampUI(lampState) {
    const statusText = lampState ? 'ON' : 'OFF';
    const statusColor = lampState ? '#22c55e' : '#ef4444';
    
    ['lampStateText', 'statLamp'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = statusText;
            el.style.color = statusColor;
        }
    });
}

// ============================================
// 9. INIT CONTROL (Event Listeners + Listener)
// ============================================
let unsubSystem = null;

export function initControl() {
    console.log('🎛 Control init');

    // ─── BUTTON: MODE ───
    document.getElementById('modeAutoBtn')?.addEventListener('click', () => setMode('otomatis'));
    document.getElementById('modeJadwalBtn')?.addEventListener('click', () => setMode('jadwal'));
    document.getElementById('modeManualBtn')?.addEventListener('click', () => setMode('manual'));

    // ─── BUTTON: LAMP ON/OFF ───
    document.getElementById('btnOn')?.addEventListener('click', () => setLamp(true));
    document.getElementById('btnOff')?.addEventListener('click', () => setLamp(false));

    // ─── BUTTON: SAVE TARGET ───
    document.getElementById('saveLightNeededBtn')?.addEventListener('click', saveLightNeeded);

    // ─── BUTTON: SAVE JADWAL ───
    document.getElementById('saveJadwalBtn')?.addEventListener('click', saveJadwal);

    // ─── CHECKBOX: FORCE DAY ON ───
    document.getElementById('forceDayOn')?.addEventListener('change', toggleForceDayOn);

    // ─── BUTTON: RESET PLANT ───
    document.getElementById('resetPlantBtn')?.addEventListener('click', resetPlant);

    // ─── LISTENER: SYSTEM ───
    unsubSystem = onValue(ref(db, 'system'), (snap) => {
        try {
            const d = snap.val();
            if (!d) return;

            // Update state
            state.controlMode = d.mode || 'otomatis';
            state.lampState = d.actual_state || false;
            state.forceDayOn = d.force_day_on || false;
            state.jadwalStart = d.jadwal_start || 6;
            state.jadwalEnd = d.jadwal_end || 18;
            state.totalLightNeeded = d.total_light_needed || 12;
            state.accumulatedLight = d.accumulated_light || 0;

            // Update UI
            updateModeUI(state.controlMode);
            updateLampUI(state.lampState);

            // Update input values (jika ada perubahan dari luar)
            const totalInput = document.getElementById('totalLightNeeded');
            if (totalInput) totalInput.value = state.totalLightNeeded;

            const startInput = document.getElementById('jadwalStart');
            if (startInput) startInput.value = state.jadwalStart;

            const endInput = document.getElementById('jadwalEnd');
            if (endInput) endInput.value = state.jadwalEnd;

            const forceCheck = document.getElementById('forceDayOn');
            if (forceCheck) forceCheck.checked = state.forceDayOn;

            // Update progress di control
            const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
            const display = progress > 100 ? 100 : progress;
            
            const lightProgress = document.getElementById('lightProgressDisplay');
            if (lightProgress) lightProgress.textContent = display + '%';
            
            const sunlight = document.getElementById('sunlightHours');
            if (sunlight) sunlight.textContent = (state.accumulatedLight || 0).toFixed(1);

        } catch (e) {
            console.error('❌ Control system error:', e);
        }
    }, (err) => {
        console.error('❌ Control system error:', err);
    });

    // ─── LOAD INITIAL STATE ───
    get(ref(db, 'system')).then((snap) => {
        const d = snap.val();
        if (d) {
            // Set default values ke input
            const totalInput = document.getElementById('totalLightNeeded');
            if (totalInput && d.total_light_needed) totalInput.value = d.total_light_needed;
            
            const startInput = document.getElementById('jadwalStart');
            if (startInput && d.jadwal_start) startInput.value = d.jadwal_start;
            
            const endInput = document.getElementById('jadwalEnd');
            if (endInput && d.jadwal_end) endInput.value = d.jadwal_end;
            
            const forceCheck = document.getElementById('forceDayOn');
            if (forceCheck && d.force_day_on !== undefined) forceCheck.checked = d.force_day_on;

            // Update mode UI
            if (d.mode) updateModeUI(d.mode);
            if (d.actual_state !== undefined) updateLampUI(d.actual_state);
        }
    }).catch(err => console.error('❌ Load initial state error:', err));

    console.log('✅ Control ready');
}

// ============================================
// 10. CLEANUP
// ============================================
export function cleanupControl() {
    if (unsubSystem) { 
        unsubSystem(); 
        unsubSystem = null; 
    }
    console.log('🧹 Control cleaned up');
}

console.log('✅ control.js loaded');
