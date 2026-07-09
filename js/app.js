import { db } from "./firebase.js";  // ✅ PATH BENAR (karena app.js di folder js)

import {
  ref,
  onValue,
  set,
  get
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ... sisanya tetap sama

/* ============================================
   SESSION & AUTH CHECK
============================================ */

// Cek session login
const sessionData = localStorage.getItem('iot_user');
if (!sessionData) {
  // Belum login → redirect ke login
  window.location.href = 'login.html';
} else {
  try {
    const user = JSON.parse(sessionData);
    console.log('👤 Login sebagai:', user.nama, '(', user.email, ')');
    
    // Session expired setelah 8 jam
    const loginTime = user.loginTime || 0;
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
    brightness: 0,
    lampState: false,
    unlocked: false
  };

  /* ========================================
     DOM
  ======================================== */

  const getEl = (id) => {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element #${id} not found!`);
    return el;
  };

  // Dashboard elements
  const tempEl = document.getElementById("dashTemp");
  const lightEl = document.getElementById("dashLight");
  const lampStatus = document.getElementById("dashLampStatus");
  
  // Other elements
  const lightBar = getEl("lightBar");
  const connStatus = getEl("connStatus");
  const monitorTemp = getEl("monitorTemp");
  const monitorLight = getEl("monitorLight");
  const monitorLampStatus = getEl("monitorLampStatus");
  const dimmer = getEl("dimmer");
  const dimmerInput = getEl("dimmerInput");
  const dimmerValue = getEl("dimmerValue");
  const btnOn = getEl("btnOn");
  const btnOff = getEl("btnOff");
  const pinInput = getEl("pinInput");
  const unlockBtn = getEl("unlockBtn");
  const accessStatus = getEl("accessStatus");
  const controlSection = getEl("controlSection");

  // Dashboard additional elements
  const dashTemp = getEl("dashTemp");
  const dashLight = getEl("dashLight");
  const dashLampStatus = getEl("dashLampStatus");
  const dashTempStatus = getEl("dashTempStatus");
  const dashLightStatus = getEl("dashLightStatus");
  const dashLampLabel = getEl("dashLampLabel");
  const dashConnStatus = getEl("dashConnStatus");
  const dashDataCount = getEl("dashDataCount");
  const dashLastUpdate = getEl("dashLastUpdate");
  const dashDimmer = getEl("dashDimmer");
  const dashDimmerValue = getEl("dashDimmerValue");
  const dashBtnOn = getEl("dashBtnOn");
  const dashBtnOff = getEl("dashBtnOff");

  // User info
  const userNameEl = document.getElementById("userName");

  /* ========================================
     CHART
  ======================================== */

  const tempLabels = [];
  const tempData = [];
  const lightLabels = [];
  const lampData = [];
  const sensorData = [];

  const tempChartEl = document.getElementById("tempChart");
  let tempChart = null;
  if (tempChartEl) {
    tempChart = new Chart(tempChartEl, {
      type: "line",
      data: {
        labels: tempLabels,
        datasets: [{
          label: "Temperature (°C)",
          data: tempData,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.2)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: "#cbd5e1" } } },
        scales: {
          x: { ticks: { color: "#94a3b8" } },
          y: { ticks: { color: "#94a3b8" } }
        }
      }
    });
  }

  const lightChartEl = document.getElementById("lightChart");
  let lightChart = null;
  if (lightChartEl) {
    lightChart = new Chart(lightChartEl, {
      type: "line",
      data: {
        labels: lightLabels,
        datasets: [{
          label: "Lamp Output (%)",
          data: lampData,
          borderColor: "#facc15",
          backgroundColor: "rgba(250,204,21,0.2)",
          borderWidth: 2,
          fill: false,
          tension: 0.4,
          pointRadius: 2
        }, {
          label: "Sensor Light (%)",
          data: sensorData,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.2)",
          borderWidth: 2,
          fill: false,
          tension: 0.4,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: "#cbd5e1" } } },
        scales: {
          x: { ticks: { color: "#94a3b8" } },
          y: { ticks: { color: "#94a3b8" } }
        }
      }
    });
  }

  /* ========================================
     DASHBOARD CHART (MINI)
  ======================================== */

  const dashTempLabels = [];
  const dashTempData = [];

  const dashTempChartEl = document.getElementById("dashTempChart");
  let dashTempChart = null;
  if (dashTempChartEl) {
    dashTempChart = new Chart(dashTempChartEl, {
      type: "line",
      data: {
        labels: dashTempLabels,
        datasets: [{
          label: "Suhu (°C)",
          data: dashTempData,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.15)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      }
    });
  }

  /* ========================================
     USER INFO
  ======================================== */

  function showUserInfo() {
    try {
      const user = JSON.parse(localStorage.getItem('iot_user') || '{}');
      if (userNameEl) {
        userNameEl.textContent = `👋 ${user.nama || 'User'}`;
      }
    } catch(e) {}
  }
  showUserInfo();

  // Logout function (global)
  window.logout = function() {
    if (confirm('Yakin mau logout?')) {
      localStorage.removeItem('iot_user');
      window.location.href = 'login.html';
    }
  };

  /* ========================================
     ACCESS UI
  ======================================== */

  function updateAccessUI() {
    if (!controlSection || !accessStatus) return;
    const controls = controlSection.querySelectorAll("button, input");
    controls.forEach((el) => {
      if (el.id !== "pinInput" && el.id !== "unlockBtn") {
        el.disabled = !state.unlocked;
      }
    });
    if (state.unlocked) {
      accessStatus.innerText = "🔓 Control Unlocked";
      accessStatus.style.color = "#22c55e";
    } else {
      accessStatus.innerText = "🔒 Control Locked";
      accessStatus.style.color = "#ef4444";
    }
  }

  updateAccessUI();

  function animateValue(el, start, end, duration = 300) {
    if (!el) return;
    let startTime = null;
    function animate(currentTime) {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const value = Math.floor(progress * (end - start) + start);
      el.innerText = value;
      if (progress < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  /* ========================================
     UPDATE STATUS TEXT - DINAMIS
  ======================================== */

  function updateStatusText() {
    const tempStatus = document.getElementById("tempStatus");
    if (tempStatus) {
      const temp = state.temperature;
      if (temp > 35) { tempStatus.innerText = "🔥 Sangat Panas";
        tempStatus.style.color = "#ef4444"; } else if (temp > 28) { tempStatus.innerText = "🔥 Panas";
        tempStatus.style.color = "#f59e0b"; } else if (temp > 20) { tempStatus.innerText = "🌤️ Normal";
        tempStatus.style.color = "#22c55e"; } else { tempStatus.innerText = "❄️ Dingin";
        tempStatus.style.color = "#3b82f6"; }
    }

    const lightStatus = document.getElementById("lightStatus");
    if (lightStatus) {
      const light = state.sensorLight;
      if (light > 80) { lightStatus.innerText = "☀️ Sangat Terang";
        lightStatus.style.color = "#facc15"; } else if (light > 50) { lightStatus.innerText = "🌤️ Intensitas Sedang";
        lightStatus.style.color = "#f59e0b"; } else if (light > 20) { lightStatus.innerText = "🌥️ Redup";
        lightStatus.style.color = "#94a3b8"; } else { lightStatus.innerText = "🌙 Gelap";
        lightStatus.style.color = "#64748b"; }
    }

    const lampStatusText = document.getElementById("lampStatusText");
    if (lampStatusText) {
      if (state.lampState) {
        lampStatusText.innerText = "💡 Lampu Aktif";
        lampStatusText.style.color = "#22c55e";
      } else {
        lampStatusText.innerText = "⛔ Lampu Mati";
        lampStatusText.style.color = "#ef4444";
      }
    }
  }

  /* ========================================
     RENDER UI
  ======================================== */

  function renderUI() {
    if (monitorTemp) {
      animateValue(monitorTemp, Number(monitorTemp.innerText) || 0, state.temperature);
    }
    if (monitorLight) {
      animateValue(monitorLight, Number(monitorLight.innerText) || 0, state.sensorLight);
    }
    if (lightBar) {
      lightBar.style.width = `${state.brightness}%`;
    }
    if (dimmer) dimmer.value = state.brightness;
    if (dimmerInput) dimmerInput.value = state.brightness;
    if (dimmerValue) dimmerValue.innerText = state.brightness;

    const lampStatusText = state.lampState ? "ON" : "OFF";
    const lampColor = state.lampState ? "#22c55e" : "#ef4444";
    
    if (lampStatus) {
      lampStatus.innerText = lampStatusText;
      lampStatus.style.color = lampColor;
    }
    if (monitorLampStatus) {
      monitorLampStatus.innerText = lampStatusText;
      monitorLampStatus.style.color = lampColor;
    }
    if (connStatus) {
      connStatus.innerText = "Realtime Connected";
      connStatus.style.color = "#22c55e";
    }

    updateAccessUI();
    updateStatusText();
    updateDashboard();
    updateDashChart();
  }

  /* ========================================
     DASHBOARD - FUNGSI UPDATE
  ======================================== */

  function updateDashboard() {
    if (dashTemp) dashTemp.innerText = state.temperature;
    if (dashLight) dashLight.innerText = state.sensorLight;
    if (dashLampStatus) {
      dashLampStatus.innerText = state.lampState ? "ON" : "OFF";
      dashLampStatus.style.color = state.lampState ? "#22c55e" : "#ef4444";
    }

    if (dashTempStatus) {
      const temp = state.temperature;
      if (temp > 35) { dashTempStatus.innerText = "🔥 Panas";
        dashTempStatus.style.color = "#ef4444"; } else if (temp > 28) { dashTempStatus.innerText = "🌤️ Hangat";
        dashTempStatus.style.color = "#f59e0b"; } else if (temp > 20) { dashTempStatus.innerText = "🌿 Normal";
        dashTempStatus.style.color = "#22c55e"; } else { dashTempStatus.innerText = "❄️ Dingin";
        dashTempStatus.style.color = "#3b82f6"; }
    }

    if (dashLightStatus) {
      const light = state.sensorLight;
      if (light > 80) { dashLightStatus.innerText = "☀️ Terang";
        dashLightStatus.style.color = "#facc15"; } else if (light > 50) { dashLightStatus.innerText = "🌤️ Sedang";
        dashLightStatus.style.color = "#f59e0b"; } else if (light > 20) { dashLightStatus.innerText = "🌥️ Redup";
        dashLightStatus.style.color = "#94a3b8"; } else { dashLightStatus.innerText = "🌙 Gelap";
        dashLightStatus.style.color = "#64748b"; }
    }

    if (dashLampLabel) {
      dashLampLabel.innerText = state.lampState ? "Aktif" : "Mati";
      dashLampLabel.style.color = state.lampState ? "#22c55e" : "#ef4444";
    }

    if (dashDimmer) dashDimmer.value = state.brightness;
    if (dashDimmerValue) dashDimmerValue.innerText = state.brightness;

    if (dashConnStatus) {
      dashConnStatus.innerText = "● Online";
      dashConnStatus.style.color = "#22c55e";
    }

    if (dashDataCount) dashDataCount.innerText = tempLabels.length;
    if (dashLastUpdate) {
      const now = new Date();
      dashLastUpdate.innerText = now.toLocaleTimeString('id-ID');
    }
  }

  /* ========================================
     DASHBOARD - UPDATE CHART
  ======================================== */

  function updateDashChart() {
    if (!dashTempChart) return;
    const time = new Date().toLocaleTimeString();
    dashTempLabels.push(time);
    dashTempData.push(state.temperature);
    if (dashTempLabels.length > 10) {
      dashTempLabels.shift();
      dashTempData.shift();
    }
    dashTempChart.update();
  }

  /* ========================================
     FIREBASE
  ======================================== */

  const rootRef = ref(db);
  onValue(rootRef, (snapshot) => {
    const data = snapshot.val();
    console.log("Firebase Data:", data);
    if (!data) return;
    const sensor = data.sensor || {};
    const control = data.control || {};
    const lamp = control.lamp || {};
    state.temperature = sensor.suhu || 0;
    state.sensorLight = sensor.cahaya || 0;
    state.brightness = lamp.brightness || 0;
    state.lampState = lamp.state || false;

    const time = new Date().toLocaleTimeString();
    if (tempChart) {
      tempLabels.push(time);
      tempData.push(state.temperature);
      if (tempLabels.length > 10) {
        tempLabels.shift();
        tempData.shift();
      }
      tempChart.update();
    }
    if (lightChart) {
      lightLabels.push(time);
      lampData.push(state.brightness);
      sensorData.push(state.sensorLight);
      if (lightLabels.length > 10) {
        lightLabels.shift();
        lampData.shift();
        sensorData.shift();
      }
      lightChart.update();
    }
    renderUI();
  }, (error) => {
    console.error("Firebase Error:", error);
    if (connStatus) {
      connStatus.innerText = "Disconnected";
      connStatus.style.color = "#ef4444";
    }
  });

  /* ========================================
     CONTROLS
  ======================================== */

  function setBrightness(value) {
    const val = Math.max(0, Math.min(100, value));
    set(ref(db, "control/lamp/brightness"), Number(val))
      .catch(err => console.error("Set brightness error:", err));
  }

  if (dimmer) {
    dimmer.addEventListener("input", (e) => {
      setBrightness(e.target.value);
    });
  }
  if (dimmerInput) {
    dimmerInput.addEventListener("input", (e) => {
      setBrightness(e.target.value);
    });
  }

  // Dashboard Dimmer
  if (dashDimmer) {
    dashDimmer.addEventListener("input", (e) => {
      setBrightness(e.target.value);
    });
  }

  if (btnOn) {
    btnOn.addEventListener("click", () => {
      set(ref(db, "control/lamp/state"), true)
        .catch(err => console.error("Set state error:", err));
    });
  }
  if (btnOff) {
    btnOff.addEventListener("click", () => {
      set(ref(db, "control/lamp/state"), false)
        .catch(err => console.error("Set state error:", err));
      set(ref(db, "control/lamp/brightness"), 0)
        .catch(err => console.error("Set brightness error:", err));
    });
  }

  // Dashboard Controls
  if (dashBtnOn) {
    dashBtnOn.addEventListener("click", () => {
      set(ref(db, "control/lamp/state"), true);
    });
  }
  if (dashBtnOff) {
    dashBtnOff.addEventListener("click", () => {
      set(ref(db, "control/lamp/state"), false);
      set(ref(db, "control/lamp/brightness"), 0);
    });
  }

  // PIN unlock (tetap ada, tapi nanti bisa dihapus jika semua user sudah pakai login)
  if (unlockBtn && pinInput) {
    unlockBtn.addEventListener("click", () => {
      const pin = pinInput.value;
      const pinRef = ref(db, "system/adminpin");
      onValue(pinRef, (snapshot) => {
        const correctPin = snapshot.val();
        if (pin === String(correctPin)) {
          state.unlocked = true;
          updateAccessUI();
          pinInput.value = "";
        } else {
          alert("Wrong PIN");
        }
      }, { onlyOnce: true });
    });
  }

  /* ========================================
     MOBILE SIDEBAR TOGGLE
  ======================================== */

  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");

  let overlay = document.querySelector(".mobile-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "mobile-overlay";
    document.body.appendChild(overlay);
  }

  function openMenu() {
    sidebar.classList.add("active");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeMenu() {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  function toggleMenu() {
    if (sidebar.classList.contains("active")) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", toggleMenu);
    menuToggle.addEventListener("touchstart", (e) => {
      e.preventDefault();
      toggleMenu();
    }, { passive: false });
  }

  overlay.addEventListener("click", closeMenu);
  overlay.addEventListener("touchstart", (e) => {
    e.preventDefault();
    closeMenu();
  }, { passive: false });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      closeMenu();
    }
  });

  console.log("✅ Mobile sidebar toggle ready!");

  /* ========================================
     SIDEBAR NAVIGATION
  ======================================== */

  console.log("🔧 INIT: Simple Navigation");

  const menuItems = document.querySelectorAll(".menu-item");
  const sections = document.querySelectorAll(".page-section");

  menuItems.forEach((item) => {
    item.addEventListener("click", function(e) {
      e.preventDefault();

      console.log("🖱️ KLIK:", this.textContent.trim());

      menuItems.forEach(m => m.classList.remove("active"));
      this.classList.add("active");

      const target = this.getAttribute("data-target");
      console.log("🎯 Target:", target);

      sections.forEach(s => s.classList.add("hidden"));

      const targetSection = document.getElementById(target);
      if (targetSection) {
        targetSection.classList.remove("hidden");
        console.log("✅ Berhasil ke:", target);
      } else {
        console.error("❌ GAGAL! Section", target, "tidak ditemukan!");
      }

      const sidebarEl = document.querySelector(".sidebar");
      if (sidebarEl && window.innerWidth <= 768) {
        sidebarEl.classList.remove("active");
        document.querySelector(".mobile-overlay")?.classList.remove("active");
      }
    });
  });

  const defaultSection = document.getElementById("dashboard");
  if (defaultSection) {
    sections.forEach(s => s.classList.add("hidden"));
    defaultSection.classList.remove("hidden");
    console.log("✅ Dashboard aktif");
  }

  console.log("✅ Navigation ready!");

  /* ========================================
     CLOCK
  ======================================== */

  function updateClock() {
    const now = new Date();
    const dateText = document.getElementById("dateText");
    const clockText = document.getElementById("clockText");
    if (dateText) {
      dateText.innerText = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    if (clockText) {
      clockText.innerText = now.toLocaleTimeString('id-ID');
    }
  }

  updateClock();
  setInterval(updateClock, 1000);

  console.log("✅ Elements loaded:", {
    tempEl: !!tempEl,
    lightEl: !!lightEl,
    lightBar: !!lightBar,
    connStatus: !!connStatus,
    lampStatus: !!lampStatus,
    monitorTemp: !!monitorTemp,
    monitorLight: !!monitorLight,
    monitorLampStatus: !!monitorLampStatus,
    dimmer: !!dimmer,
    dimmerInput: !!dimmerInput,
    dimmerValue: !!dimmerValue,
    btnOn: !!btnOn,
    btnOff: !!btnOff,
    pinInput: !!pinInput,
    unlockBtn: !!unlockBtn,
    accessStatus: !!accessStatus,
    controlSection: !!controlSection
  });

  console.log("🚀 App siap!");

});
