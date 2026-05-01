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
  // 🔥 STATE SYSTEM
  // =======================
  const state = {
    temperature: 28,
    lightIntensity: 75,
    lampStatus: "OFF"
  };

  // =======================
  // DOM ELEMENTS
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


  // =======================
  // 🔄 RENDER FUNCTION
  // =======================
  function render() {

    // temperature
    tempEl.innerText = state.temperature + "°C";

    // light intensity
    lightEl.innerText = state.lightIntensity;
    valueEl.innerText = state.lightIntensity;

    lightBar.style.width = state.lightIntensity + "%";

    slider.value = state.lightIntensity;
    input.value = state.lightIntensity;

    // lamp status
    lampStatusEl.innerText = state.lampStatus;

    if (state.lampStatus === "ON") {
      lampStatusEl.style.color = "#22c55e";
    } else {
      lampStatusEl.style.color = "#ef4444";
    }

    // connection
    connStatus.innerText = "Online";
    connStatus.style.color = "#22c55e";
  }
  const sensorRef = ref(db, 'sensor');

onValue(sensorRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;

  state.temperature = data.suhu || 0;
  state.lightIntensity = data.cahaya || 0;
  state.lampStatus = data.status ? "ON" : "OFF";

  render();
});


  // =======================
  // 🎚 CONTROL EVENTS
  // =======================

 function setLight(value) {
  const val = Math.max(0, Math.min(100, value));

  set(ref(db, 'sensor/cahaya'), val);
}


  // =======================
  // 🚨 LAMP CONTROL
  // =======================

  btnOn.addEventListener("click", function () {
  set(ref(db, 'sensor/status'), true);
});

  btnOff.addEventListener("click", function () {
  set(ref(db, 'sensor/status'), false);
});


  // =======================
  // 🌡 SIMULASI SUHU (dummy IoT feel)
  // =======================

  //setInterval(() => {
    // random kecil biar kerasa "hidup"
    //state.temperature = 27 + Math.floor(Math.random() * 4);
    //render();
  //}, 3000);


  // =======================
  // INIT FIRST RENDER
  // =======================
  render();

});
