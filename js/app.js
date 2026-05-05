import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyChvTp4M8FoT7qI008irZ5KOnjOiRFk6uc",
  authDomain: "growlightta.firebaseapp.com",
  databaseURL: "https://growlightta-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "growlightta",
  storageBucket: "growlightta.firebasestorage.app",
  messagingSenderId: "982821946750",
  appId: "1:982821946750:web:98fc04e2b573e9dd955f2f"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

document.addEventListener("DOMContentLoaded", function () {

  // =======================
  // STATE
  // =======================
  const state = {
    temperature: 0,
    lightIntensity: 0,
    lampStatus: "-"
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
//chart
  const ctx = document.getElementById("tempChart");
  const ctxLight = document.getElementById("lightChart");

let lightData = [];
let lightLabels = [];

const lightChart = new Chart(ctxLight, {
  type: 'line',
  data: {
    labels: lightLabels,
    datasets: [{
      label: 'Cahaya (%)',
      data: lightData,
      borderWidth: 2,
      tension: 0.4,
      fill: 'start',
      backgroundColor: "rgba(255,215,0,0.2)",
      borderColor: "#facc15",
      pointRadius: 3
    }]
  }
});

let tempData = [];
let labels = [];

const tempChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: labels,
    datasets: [{
  label: 'Suhu (°C)',
  data: tempData,
  borderWidth: 2,
  tension: 0.4,

  // 🔥 WAJIB
  fill: 'start',

  backgroundColor: "rgba(34,197,94,0.3)", // agak diperjelas
  borderColor: "#22c55e",

  pointRadius: 3,
  pointBackgroundColor: "#22c55e"
}]
  },
 options: {
  responsive: true,
  plugins: {
    legend: {
      labels: {
        color: "#fff"
      }
    }
  },
  scales: {
    y: {
      beginAtZero: false
    }
  }
}
});

  // default status
  connStatus.innerText = "Connecting...";
  connStatus.style.color = "orange";

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

tempEl.innerText = state.temperature + "°C (" + statusText + ")";

    lightEl.innerText = state.lightIntensity;
    valueEl.innerText = state.lightIntensity;
    lightBar.style.width = state.lightIntensity + "%";

    slider.value = state.lightIntensity;
    input.value = state.lightIntensity;

    lampStatusEl.innerText = state.lampStatus;

    if (state.lampStatus === "ON") {
      lampStatusEl.style.color = "#22c55e";
    } else {
      lampStatusEl.style.color = "#ef4444";
    }

    connStatus.innerText = "Connected";
    connStatus.style.color = "#22c55e";
  }

  // =======================
  // REALTIME LISTENER
  // =======================
const sensorRef = ref(db, 'sensor');

onValue(sensorRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;

  // ambil data dari Firebase
  state.temperature = data.suhu || 0;
  state.lightIntensity = data.cahaya || 0;
  state.lampStatus = data.status ? "ON" : "OFF";

  const now = new Date().toLocaleTimeString();

  // ===== CHART SUHU =====
  labels.push(now);
  tempData.push(state.temperature);

  if (labels.length > 10) {
    labels.shift();
    tempData.shift();
  }

  tempChart.update();

  // ===== CHART CAHAYA =====
  lightLabels.push(now);
  lightData.push(state.lightIntensity);

  if (lightLabels.length > 10) {
    lightLabels.shift();
    lightData.shift();
  }

  lightChart.update();

  // render UI
  render();
});
 // =======================
// UPDATE CHART SUHU
// =======================
const now = new Date().toLocaleTimeString();

labels.push(now);
tempData.push(state.temperature);

if (labels.length > 10) {
  labels.shift();
  tempData.shift();
}

tempChart.update();


// =======================
// UPDATE CHART CAHAYA
// =======================
lightLabels.push(now);
lightData.push(state.lightIntensity);

if (lightLabels.length > 10) {
  lightLabels.shift();
  lightData.shift();
}

lightChart.update();

render();
});

  // =======================
  // CONTROL
  // =======================
  function setLight(value) {
    const val = Math.max(0, Math.min(100, value));
    set(ref(db, 'sensor/cahaya'), val);
  }

  slider.addEventListener("input", function () {
    setLight(this.value);
  });

  input.addEventListener("input", function () {
    setLight(this.value);
  });

  btnOn.addEventListener("click", function () {
    set(ref(db, 'sensor/status'), true);
  });

  btnOff.addEventListener("click", function () {
    set(ref(db, 'sensor/status'), false);
  });

});
