import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "growlightta.firebaseapp.com",
  databaseURL: "https://growlightta-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "growlightta",
  storageBucket: "growlightta.firebasestorage.app",
  messagingSenderId: "982821946750",
  appId: "1:982821946750:web:98fc04e2b573e9dd955f2f"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

document.addEventListener("DOMContentLoaded", () => {

  // =======================
  // STATE
  // =======================

  const state = {
    temperature: 0,
    brightness: 0,
    sensorLight: 0,
    lampStatus: "-",
    unlocked: false
  };

  // =======================
  // DOM
  // =======================

  const tempEl = document.getElementById("temp");
  const lightEl = document.getElementById("light");
  const lightBar = document.getElementById("lightBar");
  const lampStatusEl = document.getElementById("lampStatus");

  const slider = document.getElementById("dimmer");
  const input = document.getElementById("dimmerInput");
  const valueEl = document.getElementById("dimmerValue");

  const btnOn = document.getElementById("btnOn");
  const btnOff = document.getElementById("btnOff");

  const connStatus = document.getElementById("connStatus");

  const pinInput = document.getElementById("pinInput");
  const unlockBtn = document.getElementById("unlockBtn");
  const accessStatus = document.getElementById("accessStatus");
  const controlSection = document.getElementById("controlSection");

  // =======================
  // CHART INIT
  // =======================

  const tempCtx = document.getElementById("tempChart");
  const lightCtx = document.getElementById("lightChart");

  let labels = [];
  let tempData = [];

  let lightLabels = [];
  let lightData = [];
  let sensorLightData = [];

  // =======================
  // TEMP CHART
  // =======================

  const tempChart = new Chart(tempCtx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Suhu (°C)",
        data: tempData,
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        backgroundColor: "rgba(34,197,94,0.3)",
        borderColor: "#22c55e",
        pointRadius: 3
      }]
    }
  });

  // =======================
  // LIGHT CHART
  // =======================

  const lightChart = new Chart(lightCtx, {
    type: "line",
    data: {
      labels: lightLabels,
      datasets: [

        {
          label: "Lamp Output (%)",
          data: lightData,
          borderWidth: 2,
          tension: 0.4,
          fill: false,
          borderColor: "#facc15",
          backgroundColor: "rgba(255,215,0,0.2)",
          pointRadius: 3
        },

        {
          label: "Sensor Light (%)",
          data: sensorLightData,
          borderWidth: 2,
          tension: 0.4,
          fill: false,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.2)",
          pointRadius: 3
        }

      ]
    }
  });

  // =======================
  // STATUS AWAL
  // =======================

  connStatus.innerText = "Connecting...";
  connStatus.style.color = "orange";

  updateControlAccess();

  // =======================
  // ACCESS CONTROL
  // =======================

  function updateControlAccess() {

    const controls = controlSection.querySelectorAll(
      "button, input"
    );

    controls.forEach(el => {

      if (
        el.id !== "pinInput" &&
        el.id !== "unlockBtn"
      ) {
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

  // =======================
  // RENDER
  // =======================

  function render() {

    let statusText = "";

    if (state.temperature > 30) {
      statusText = "🔥 Panas";
    } else if (state.temperature >= 25) {
      statusText = "🌱 Ideal";
    } else {
      statusText = "❄️ Dingin";
    }

    tempEl.innerText =
      `${state.temperature}°C (${statusText})`;

    lightEl.innerText =
      state.sensorLight;

    valueEl.innerText =
      state.brightness;

    lightBar.style.width =
      state.brightness + "%";

    slider.value =
      state.brightness;

    input.value =
      state.brightness;

    lampStatusEl.innerText =
      state.lampStatus;

    lampStatusEl.style.color =
      state.lampStatus === "ON"
        ? "#22c55e"
        : "#ef4444";

    connStatus.innerText = "Connected";
    connStatus.style.color = "#22c55e";
  }

  // =======================
  // REALTIME FIREBASE
  // =======================

  const rootRef = ref(db);

  onValue(rootRef, (snapshot) => {

    const data = snapshot.val();

    if (!data) return;

    const sensor = data.sensor || {};
    const control = data.control || {};

    state.temperature =
      sensor.suhu || 0;

    state.sensorLight =
      sensor.cahaya || 0;

    state.brightness =
      control.brightness || 0;

    state.lampStatus =
      control.lamp ? "ON" : "OFF";

    const now =
      new Date().toLocaleTimeString();

    // suhu chart
    labels.push(now);
    tempData.push(state.temperature);

    if (labels.length > 10) {

      labels.shift();
      tempData.shift();

    }

    tempChart.update();

    // light chart
    lightLabels.push(now);

    lightData.push(state.brightness);

    sensorLightData.push(
      state.sensorLight
    );

    if (lightLabels.length > 10) {

      lightLabels.shift();
      lightData.shift();
      sensorLightData.shift();

    }

    lightChart.update();

    render();

  });

  // =======================
  // CONTROL
  // =======================

  function setLight(value) {

    const val =
      Math.max(0, Math.min(100, value));

    set(
      ref(db, "control/brightness"),
      val
    );
  }

  slider.addEventListener("input", function () {
    setLight(this.value);
  });

  input.addEventListener("input", function () {
    setLight(this.value);
  });

  btnOn.addEventListener("click", () => {

    set(
      ref(db, "control/lamp"),
      true
    );

  });

  btnOff.addEventListener("click", () => {

    set(
      ref(db, "control/lamp"),
      false
    );

    set(
      ref(db, "control/brightness"),
      0
    );

  });

  // =======================
  // PIN ACCESS
  // =======================

  unlockBtn.addEventListener("click", () => {

    const pin = pinInput.value;

    const pinRef =
      ref(db, "system/adminpin");

    onValue(pinRef, (snapshot) => {

      const correctPin = snapshot.val();

      if (pin === String(correctPin)) {

        state.unlocked = true;

        updateControlAccess();

        pinInput.value = "";

      } else {

        alert("PIN Salah");

      }

    }, {
      onlyOnce: true
    });

  });

});
