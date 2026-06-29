import { db } from "./firebase.js";

import {
  ref,
  onValue,
  set
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* ========================================
   APP START
======================================== */

document.addEventListener("DOMContentLoaded", () => {

  const state = {
    temperature: 0,
    sensorLight: 0,
    brightness: 0,
    lampState: false,
    unlocked: false
  };

  /* ========================================
     DOM - SEMUA ADA DI HTML
  ======================================== */

  const tempEl = document.getElementById("temp");
  const lightEl = document.getElementById("light");
  const lightBar = document.getElementById("lightBar");
  const connStatus = document.getElementById("connStatus");
  const lampStatus = document.getElementById("lampStatus");
  const monitorTemp = document.getElementById("monitorTemp");
  const monitorLight = document.getElementById("monitorLight");
  const monitorLampStatus = document.getElementById("monitorLampStatus");
  const dimmer = document.getElementById("dimmer");
  const dimmerInput = document.getElementById("dimmerInput");
  const dimmerValue = document.getElementById("dimmerValue");
  const btnOn = document.getElementById("btnOn");
  const btnOff = document.getElementById("btnOff");
  const pinInput = document.getElementById("pinInput");
  const unlockBtn = document.getElementById("unlockBtn");
  const accessStatus = document.getElementById("accessStatus");
  const controlSection = document.getElementById("controlSection");

  /* ========================================
     CHART DATA
  ======================================== */

  const tempLabels = [];
  const tempData = [];
  const lightLabels = [];
  const lampData = [];
  const sensorData = [];

  /* ========================================
     TEMPERATURE CHART
  ======================================== */

  const tempChart = new Chart(
    document.getElementById("tempChart"),
    {
      type: "line",
      data: {
        labels: tempLabels,
        datasets: [
          {
            label: "Temperature (°C)",
            data: tempData,
            borderColor: "#22c55e",
            backgroundColor: "rgba(34,197,94,0.2)",
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: {
              color: "#cbd5e1"
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: "#94a3b8"
            }
          },
          y: {
            ticks: {
              color: "#94a3b8"
            }
          }
        }
      }
    }
  );

  /* ========================================
     LIGHT CHART
  ======================================== */

  const lightChart = new Chart(
    document.getElementById("lightChart"),
    {
      type: "line",
      data: {
        labels: lightLabels,
        datasets: [
          {
            label: "Lamp Output (%)",
            data: lampData,
            borderColor: "#facc15",
            backgroundColor: "rgba(250,204,21,0.2)",
            borderWidth: 2,
            fill: false,
            tension: 0.4,
            pointRadius: 2
          },
          {
            label: "Sensor Light (%)",
            data: sensorData,
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56,189,248,0.2)",
            borderWidth: 2,
            fill: false,
            tension: 0.4,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: {
              color: "#cbd5e1"
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: "#94a3b8"
            }
          },
          y: {
            ticks: {
              color: "#94a3b8"
            }
          }
        }
      }
    }
  );

  /* ========================================
     ACCESS UI
  ======================================== */

  function updateAccessUI() {
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
    if (!el) return; // Safety check
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
     RENDER UI
  ======================================== */

  function renderUI() {
    // Dashboard cards
    animateValue(tempEl, Number(tempEl.innerText) || 0, state.temperature);
    animateValue(lightEl, Number(lightEl.innerText) || 0, state.sensorLight);
    
    // Monitoring cards
    if (monitorTemp) {
      animateValue(monitorTemp, Number(monitorTemp.innerText) || 0, state.temperature);
    }
    if (monitorLight) {
      animateValue(monitorLight, Number(monitorLight.innerText) || 0, state.sensorLight);
    }

    // Light bar
    if (lightBar) {
      lightBar.style.width = `${state.brightness}%`;
    }

    // Dimmer
    if (dimmer) dimmer.value = state.brightness;
    if (dimmerInput) dimmerInput.value = state.brightness;
    if (dimmerValue) dimmerValue.innerText = state.brightness;

    // Lamp status - update ALL lamp status elements
    const lampStatusText = state.lampState ? "ON" : "OFF";
    const lampColor = state.lampState ? "#22c55e" : "#ef4444";
    
    // Update all elements with lamp status
    const allLampStatus = document.querySelectorAll('#lampStatus, #monitorLampStatus');
    allLampStatus.forEach(el => {
      el.innerText = lampStatusText;
      el.style.color = lampColor;
    });

    // Connection status
    if (connStatus) {
      connStatus.innerText = "Realtime Connected";
      connStatus.style.color = "#22c55e";
    }
  }

  /* ========================================
     FIREBASE REALTIME
  ======================================== */

  const rootRef = ref(db);

  onValue(
    rootRef,
    (snapshot) => {
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

      // Update temp chart
      tempLabels.push(time);
      tempData.push(state.temperature);
      if (tempLabels.length > 10) {
        tempLabels.shift();
        tempData.shift();
      }
      tempChart.update();

      // Update light chart
      lightLabels.push(time);
      lampData.push(state.brightness);
      sensorData.push(state.sensorLight);
      if (lightLabels.length > 10) {
        lightLabels.shift();
        lampData.shift();
        sensorData.shift();
      }
      lightChart.update();

      renderUI();
    },
    (error) => {
      console.error("Firebase Error:", error);
      if (connStatus) {
        connStatus.innerText = "Disconnected";
        connStatus.style.color = "#ef4444";
      }
    }
  );

  /* ========================================
     SET BRIGHTNESS
  ======================================== */

  function setBrightness(value) {
    const val = Math.max(0, Math.min(100, value));
    set(ref(db, "control/lamp/brightness"), Number(val));
  }

  /* ========================================
     DIMMER EVENT
  ======================================== */

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

  /* ========================================
     BUTTON CONTROL
  ======================================== */

  if (btnOn) {
    btnOn.addEventListener("click", () => {
      set(ref(db, "control/lamp/state"), true);
    });
  }

  if (btnOff) {
    btnOff.addEventListener("click", () => {
      set(ref(db, "control/lamp/state"), false);
      set(ref(db, "control/lamp/brightness"), 0);
    });
  }

  /* ========================================
     PIN ACCESS
  ======================================== */

  if (unlockBtn) {
    unlockBtn.addEventListener("click", () => {
      const pin = pinInput ? pinInput.value : "";
      const pinRef = ref(db, "system/adminpin");

      onValue(
        pinRef,
        (snapshot) => {
          const correctPin = snapshot.val();
          if (pin === String(correctPin)) {
            state.unlocked = true;
            updateAccessUI();
            if (pinInput) pinInput.value = "";
          } else {
            alert("Wrong PIN");
          }
        },
        {
          onlyOnce: true
        }
      );
    });
  }

  /* ========================================
     SIDEBAR NAVIGATION
  ======================================== */

  const menuItems = document.querySelectorAll(".menu-item");
  const sections = document.querySelectorAll(".page-section");

  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      menuItems.forEach((menu) => {
        menu.classList.remove("active");
      });

      item.classList.add("active");

      sections.forEach((section) => {
        section.classList.add("hidden");
      });

      const target = item.dataset.target;
      const targetSection = document.getElementById(target);
      if (targetSection) {
        targetSection.classList.remove("hidden");
      }
    });
  });

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

});
