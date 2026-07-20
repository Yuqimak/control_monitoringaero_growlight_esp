import { db } from "./firebase.js";

import {
  ref,
  onValue,
  set,
  get,
  update,
  push
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* ============================================
   SESSION & AUTH CHECK
============================================ */

let currentUser = null;
const sessionData = localStorage.getItem('iot_user');
if (!sessionData) {
  window.location.href = 'login.html';
} else {
  try {
    currentUser = JSON.parse(sessionData);
    console.log('👤 Login sebagai:', currentUser.nama, '(', currentUser.username, ')', 'Role:', currentUser.role);
    const loginTime = currentUser.loginTime || 0;
    const expired = (Date.now() - loginTime) > 8 * 60 * 60 * 1000;
    if (expired) {
      localStorage.removeItem('iot_user');
      window.location.href = 'login.html';
    }
  } catch(e) {
    localStorage.removeItem('iot_user');
    window.location.href = 'login.html';
  }
}

/* ============================================
   APP START
============================================ */

document.addEventListener("DOMContentLoaded", () => {

  const state = {
    temperature: 0,
    sensorLight: 0,
    lampState: false,
    mode: 'manual',
    plantStartDate: null,
    alert: ''
  };

  /* ========================================
     DOM
  ======================================== */

  const getEl = (id) => {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element #${id} not found!`);
    return el;
  };

  const connStatus = getEl("connStatus");
  const monitorTemp = getEl("monitorTemp");
  const monitorLight = getEl("monitorLight");
  const monitorLampStatus = getEl("monitorLampStatus");
  const btnOn = getEl("btnOn");
  const btnOff = getEl("btnOff");
  const controlSection = getEl("controlSection");
  const dashTemp = getEl("dashTemp");
  const dashLight = getEl("dashLight");
  const dashLampStatus = getEl("dashLampStatus");
  const dashTempStatus = getEl("dashTempStatus");
  const dashLightStatus = getEl("dashLightStatus");
  const dashLampLabel = getEl("dashLampLabel");
  const dashConnStatus = getEl("dashConnStatus");
  const dashDataCount = getEl("dashDataCount");
  const dashLastUpdate = getEl("dashLastUpdate");
  const adminMenu = document.getElementById('adminMenu');
  const userList = document.getElementById('userList');
  const addUserForm = document.getElementById('addUserForm');
  const addUserMsg = document.getElementById('addUserMsg');
  const userNameEl = document.getElementById("userName");

  const growthModeSelect = getEl("growthMode");
  const applyModeBtn = getEl("applyModeBtn");
  const currentModeDisplay = getEl("currentModeDisplay");
  const modeDurationDisplay = getEl("modeDurationDisplay");
  const modeIcon = getEl("modeIcon");
  const modeName = getEl("modeName");
  const modeDuration = getEl("modeDuration");
  const dayCounter = getEl("dayCounter");
  const timelineMessage = getEl("timelineMessage");
  const resetPlantBtn = getEl("resetPlantBtn");

  const exportPeriod = getEl("exportPeriod");
  const exportBtn = getEl("exportBtn");
  const exportStatus = getEl("exportStatus");
  const exportPdfBtn = getEl("exportPdfBtn");

  const overheatContainer = document.getElementById('overheatContainer');
  const overheatMessage = document.getElementById('overheatMessage');

  /* ========================================
     ADMIN MENU – Tampilkan hanya jika admin
  ======================================== */
  if (currentUser && currentUser.role === 'admin') {
    if (adminMenu) adminMenu.style.display = 'block';
  } else {
    if (adminMenu) adminMenu.style.display = 'none';
  }

  /* ========================================
     MODE CONFIGURATION & REST OF APP
  ======================================== */
  const MODE_CONFIG = {
    bibit:   { icon: '🌱', label: 'Bibit', duration: 4 },
    vegetatif: { icon: '🌿', label: 'Vegetatif', duration: 14 },
    generatif: { icon: '🥔', label: 'Generatif', duration: 12 },
    panen:   { icon: '🌾', label: 'Panen', duration: 9 },
    manual:  { icon: '🎛', label: 'Manual', duration: null }
  };

  function getModeConfig(modeKey) {
    return MODE_CONFIG[modeKey] || MODE_CONFIG.manual;
  }

  function getDaysSincePlanting() {
    if (!state.plantStartDate) return 0;
    const start = new Date(state.plantStartDate);
    const now = new Date();
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
  }

  function getReminderMessage(days) {
    if (days >= 7 && days < 10) return '🌱 Bibit siap pindah ke Vegetatif!';
    if (days >= 28 && days < 31) return '🌿 Vegetatif siap pindah ke Generatif!';
    if (days >= 56 && days < 59) return '🥔 Generatif siap pindah ke Panen!';
    if (days >= 70) return '🌾 Waktunya panen! Kentang siap dipetik!';
    return null;
  }

  /* ========================================
     CHART SETUP (disingkat untuk space)
  ======================================== */
  const MAX_DATA_POINTS = 15;
  const tempLabels = [], tempData = [], lightLabels = [], lampData = [], sensorData = [];

  const tempChartEl = document.getElementById("tempChart");
  let tempChart = null;
  if (tempChartEl) {
    tempChart = new Chart(tempChartEl, {
      type: "line",
      data: { labels: tempLabels, datasets: [{ label: "Temperature (°C)", data: tempData, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.2)", borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 }] },
      options: { responsive: true, plugins: { legend: { labels: { color: "#cbd5e1" } } }, scales: { x: { ticks: { color: "#94a3b8" } }, y: { ticks: { color: "#94a3b8" } } } }
    });
  }

  const lightChartEl = document.getElementById("lightChart");
  let lightChart = null;
  if (lightChartEl) {
    lightChart = new Chart(lightChartEl, {
      type: "line",
      data: { labels: lightLabels, datasets: [{ label: "Lamp Output (%)", data: lampData, borderColor: "#facc15", backgroundColor: "rgba(250,204,21,0.2)", borderWidth: 2, fill: false, tension: 0.4, pointRadius: 2 }, { label: "Sensor Light (%)", data: sensorData, borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.2)", borderWidth: 2, fill: false, tension: 0.4, pointRadius: 2 }] },
      options: { responsive: true, plugins: { legend: { labels: { color: "#cbd5e1" } } }, scales: { x: { ticks: { color: "#94a3b8" } }, y: { ticks: { color: "#94a3b8" } } } }
    });
  }

  const dashTempLabels = [], dashTempData = [];
  const dashTempChartEl = document.getElementById("dashTempChart");
  let dashTempChart = null;
  if (dashTempChartEl) {
    dashTempChart = new Chart(dashTempChartEl, {
      type: "line",
      data: { labels: dashTempLabels, datasets: [{ label: "Suhu (°C)", data: dashTempData, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.15)", borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
  }

  /* ========================================
     USER INFO & LOGOUT
  ======================================== */
  function showUserInfo() {
    try {
      const user = JSON.parse(localStorage.getItem('iot_user') || '{}');
      if (userNameEl) userNameEl.textContent = `👋 ${user.nama || 'User'}`;
    } catch(e) {}
  }
  showUserInfo();

  window.logout = function() {
    if (confirm('Yakin mau logout?')) {
      localStorage.removeItem('iot_user');
      window.location.href = 'login.html';
    }
  };

  /* ========================================
     ANIMATE, STATUS, RENDER (disingkat)
  ======================================== */
  function animateValue(el, start, end, duration = 300) { /* ... */ }
  function updateStatusText() { /* ... */ }
  function updateOverheat() { /* ... */ }
  function renderUI() { /* ... */ }
  function updateDashboard() { /* ... */ }
  function updateDashChart() { /* ... */ }
  function updateModeUI() { /* ... */ }

  // Fungsi-fungsi di atas sudah ada di kode sebelumnya, saya tidak tulis ulang untuk menghemat tempat.
  // TAPI PASTIKAN ANDA MENGGUNAKAN VERSI YANG SUDAH LENGKAP DARI JAWABAN SEBELUMNYA.
  // Saya akan sertakan bagian yang penting yaitu ADMIN PANEL.

  /* ========================================
     ADMIN PANEL – FUNGSI CRUD USER
  ======================================== */

  function loadUserList() {
    if (!userList) return;
    const userListRef = ref(db, 'users');
    onValue(userListRef, (snapshot) => {
      const users = snapshot.val();
      if (!users) {
        userList.innerHTML = '<p style="color:var(--muted); text-align:center; padding:20px;">Belum ada user terdaftar.</p>';
        return;
      }
      let html = `<table style="width:100%; text-align:left; border-collapse:collapse; font-size:14px;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,.1);">
            <th style="padding:8px 4px;">Username</th>
            <th style="padding:8px 4px;">Nama</th>
            <th style="padding:8px 4px;">Role</th>
            <th style="padding:8px 4px;">Aksi</th>
          </tr>
        </thead>
        <tbody>`;
      for (const [username, data] of Object.entries(users)) {
        const isCurrent = (username === currentUser.username);
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,.05);">
          <td style="padding:8px 4px;">${username}${isCurrent ? ' 👑' : ''}</td>
          <td style="padding:8px 4px;">${data.nama || '-'}</td>
          <td style="padding:8px 4px;"><span style="background:${data.role === 'admin' ? 'rgba(139,92,246,.2)' : 'rgba(34,197,94,.2)'}; padding:2px 10px; border-radius:12px; font-size:12px;">${data.role}</span></td>
          <td style="padding:8px 4px;">
            ${!isCurrent ? `
              <button onclick="window.changeRole('${username}', 'admin')" class="small-btn" style="background:rgba(139,92,246,.2); border:none; color:#a78bfa; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:11px; margin-right:4px;">⬆ Admin</button>
              <button onclick="window.changeRole('${username}', 'petani')" class="small-btn" style="background:rgba(34,197,94,.2); border:none; color:#4ade80; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:11px; margin-right:4px;">⬇ Petani</button>
              <button onclick="window.deleteUser('${username}')" class="small-btn danger" style="background:rgba(239,68,68,.2); border:none; color:#f87171; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:11px;">🗑 Hapus</button>
            ` : '<span style="color:var(--muted); font-size:11px;">(Anda)</span>'}
          </td>
        </tr>`;
      }
      html += '</tbody></table>';
      userList.innerHTML = html;
    });
  }

  window.changeRole = function(username, newRole) {
    if (currentUser.role !== 'admin') {
      alert('❌ Hanya admin yang bisa mengubah role!');
      return;
    }
    if (!confirm(`Ubah role ${username} menjadi ${newRole}?`)) return;
    update(ref(db, `users/${username}`), { role: newRole })
      .then(() => {
        if (addUserMsg) {
          addUserMsg.textContent = '✅ Role berhasil diubah!';
          addUserMsg.style.color = '#22c55e';
        }
      })
      .catch(err => {
        console.error(err);
        if (addUserMsg) {
          addUserMsg.textContent = '❌ Gagal mengubah role.';
          addUserMsg.style.color = '#ef4444';
        }
      });
  };

  window.deleteUser = function(username) {
    if (currentUser.role !== 'admin') {
      alert('❌ Hanya admin yang bisa menghapus user!');
      return;
    }
    if (!confirm(`Hapus user ${username}?`)) return;
    set(ref(db, `users/${username}`), null)
      .then(() => {
        if (addUserMsg) {
          addUserMsg.textContent = '✅ User berhasil dihapus!';
          addUserMsg.style.color = '#22c55e';
        }
      })
      .catch(err => {
        console.error(err);
        if (addUserMsg) {
          addUserMsg.textContent = '❌ Gagal menghapus user.';
          addUserMsg.style.color = '#ef4444';
        }
      });
  };

  if (addUserForm) {
    addUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (currentUser.role !== 'admin') {
        alert('❌ Hanya admin yang bisa menambah user!');
        return;
      }
      const username = document.getElementById('newUsername').value.trim();
      const password = document.getElementById('newPassword').value.trim();
      const nama = document.getElementById('newNama').value.trim() || username;
      const role = document.getElementById('newRole').value;
      if (!username || !password) {
        if (addUserMsg) {
          addUserMsg.textContent = '❌ Username dan password wajib diisi!';
          addUserMsg.style.color = '#ef4444';
        }
        return;
      }
      // ... (validasi dan set user) seperti sebelumnya
      // Gunakan kode yang sudah ada dari jawaban sebelumnya.
    });
  }

  // Lanjutkan dengan Firebase listener, dll.

  /* ========================================
     FIREBASE REALTIME (CONTOH)
  ======================================== */
  const rootRef = ref(db);
  onValue(rootRef, (snapshot) => {
    const data = snapshot.val();
    console.log("Firebase Data:", data);
    if (!data) return;
    // ... update state, render, dll.
  }, (error) => {
    console.error("Firebase Error:", error);
    if (connStatus) {
      connStatus.innerText = "Disconnected";
      connStatus.style.color = "#ef4444";
    }
  });

  // Jangan lupa muat daftar user jika admin
  if (currentUser && currentUser.role === 'admin') {
    loadUserList();
  }

  console.log("🚀 App siap!");
});
