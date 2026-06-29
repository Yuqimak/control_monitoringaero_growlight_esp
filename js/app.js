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

  /* ========================================
     STATE
  ======================================== */

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

  const tempEl = document.getElementById("temp");
  const lightEl = document.getElementById("light");
  const lightBar = document.getElementById("lightBar");
  const connStatus = document.getElementById("connStatus");
  const statusDot = document.getElementById("statusDot");
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
  const dashboardTemp = document.getElementById("dashboardTemp");
  const dashboardLight = document.getElementById("dashboardLight");
  const dashboardLamp = document.getElementById("dashboardLamp");

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
    animateValue(tempEl, Number(tempEl.innerText) || 0, state.temperature);
    animateValue(lightEl, Number(lightEl.innerText) || 0, state.sensorLight);

    lightBar.style.width = `${state.brightness}%`;
    dimmer.value = state.brightness;
    dimmerInput.value = state.brightness;
    dimmerValue.innerText = state.brightness;

    lampStatus.innerText = state.lampState ? "ON" : "OFF";
    lampStatus.style.color = state.lampState ? "#22c55e" : "#ef4444";

    dashboardTemp.innerText = state.temperature;
    dashboardLight.innerText = state.sensorLight;
    dashboardLamp.innerText = state.lampState ? "ON" : "OFF";
    dashboardLamp.style.color = state.lampState ? "#22c55e" : "#ef4444";

    connStatus.innerText = "Realtime Connected";
    connStatus.style.color = "#22c55e";
    statusDot.style.background = "#22c55e";
  }

  /* ========================================
     FIREBASE REALTIME
  ======================================== */

  const rootRef = ref(db);

  onValue(
    rootRef,
    (snapshot) => {
      const data = snapshot.val();
      console.log("Firebase Data:", data); // Debug

      if (!data) return;

      const sensor = data.sensor || {};
      const control = data.control || {};
      const lamp = control.lamp || {};

      /* =========================
         UPDATE STATE
      ========================= */

      state.temperature = sensor.suhu || 0;
      state.sensorLight = sensor.cahaya || 0;
      state.brightness = lamp.brightness || 0;
      state.lampState = lamp.state || false;

      /* =========================
         UPDATE CHART
      ========================= */

      const time = new Date().toLocaleTimeString();

      // TEMP CHART
      tempLabels.push(time);
      tempData.push(state.temperature);
      if (tempLabels.length > 10) {
        tempLabels.shift();
        tempData.shift();
      }
      tempChart.update();

      // LIGHT CHART
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
      connStatus.innerText = "Disconnected";
      connStatus.style.color = "#ef4444";
      statusDot.style.background = "#ef4444";
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

  dimmer.addEventListener("input", (e) => {
    setBrightness(e.target.value);
  });

  dimmerInput.addEventListener("input", (e) => {
    setBrightness(e.target.value);
  });

  /* ========================================
     BUTTON CONTROL
  ======================================== */

  btnOn.addEventListener("click", () => {
    set(ref(db, "control/lamp/state"), true);
  });

  btnOff.addEventListener("click", () => {
    set(ref(db, "control/lamp/state"), false);
    set(ref(db, "control/lamp/brightness"), 0);
  });

  /* ========================================
     PIN ACCESS
  ======================================== */

  unlockBtn.addEventListener("click", () => {
    const pin = pinInput.value;
    const pinRef = ref(db, "system/adminpin");

    onValue(
      pinRef,
      (snapshot) => {
        const correctPin = snapshot.val();
        if (pin === String(correctPin)) {
          state.unlocked = true;
          updateAccessUI();
          pinInput.value = "";
        } else {
          alert("Wrong PIN");
        }
      },
      {
        onlyOnce: true
      }
    );
  });

  /* ========================================
     SIDEBAR NAVIGATION
  ======================================== */

  const menuItems = document.querySelectorAll(".menu-item");
  const sections = document.querySelectorAll(".page-section");

  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      // remove active menu
      menuItems.forEach((menu) => {
        menu.classList.remove("active");
      });

      // active current menu
      item.classList.add("active");

      // hide all section
      sections.forEach((section) => {
        section.classList.add("hidden");
      });

      // show selected section
      const target = item.dataset.target;
      const targetSection = document.getElementById(target);
      if (targetSection) {
        targetSection.classList.remove("hidden");
      }
    });
  });

}); // <-- TUTUP DOMContentLoaded - HANYA 1
