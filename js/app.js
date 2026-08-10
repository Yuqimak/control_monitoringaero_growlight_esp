// ============================================
// FUNGSI SET LAMPU STATE (FIXED)
// ============================================
function setLampState(newState) {
  console.log('🔄 setLampState:', newState);
  set(ref(db, 'system/state'), newState)
    .then(() => {
      state.lampState = newState; // ← PAKAI state GLOBAL, BUKAN PARAMETER
      scheduleRender();
      showToast(`✅ Lampu ${newState ? 'ON' : 'OFF'}`, 'success');
    })
    .catch(err => {
      console.error('❌ Gagal:', err);
      showToast('❌ Gagal: ' + err.message, 'error');
    });
}

// ============================================
// FUNGSI SET MODE (SUDAH AMAN, TAPI TETAP PERIKSA)
// ============================================
function setModeControl(mode) {
  console.log('🔄 setModeControl:', mode);
  set(ref(db, 'system/mode'), mode)
    .then(() => {
      state.controlMode = mode;
      const display = document.getElementById('currentModeDisplay2');
      if (display) {
        const labels = { otomatis: '🤖 Otomatis', jadwal: '⏰ Jadwal', manual: '👋 Manual' };
        display.textContent = labels[mode] || mode;
      }
      updateModeButtonUI(mode);
      showToast(`✅ Mode ${mode} aktif`, 'success');
    })
    .catch(err => showToast('❌ Gagal: ' + err.message, 'error'));
}
