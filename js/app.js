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


  // =======================
  // 🎚 CONTROL EVENTS
  // =======================

  function setLight(value) {
    state.lightIntensity = Math.max(0, Math.min(100, value));
    render();
  }

  slider.addEventListener("input", function () {
    setLight(this.value);
  });

  input.addEventListener("input", function () {
    setLight(this.value);
  });


  // =======================
  // 🚨 LAMP CONTROL
  // =======================

  btnOn.addEventListener("click", function () {
    state.lampStatus = "ON";
    render();
  });

  btnOff.addEventListener("click", function () {
    state.lampStatus = "OFF";
    render();
  });


  // =======================
  // 🌡 SIMULASI SUHU (dummy IoT feel)
  // =======================

  setInterval(() => {
    // random kecil biar kerasa "hidup"
    state.temperature = 27 + Math.floor(Math.random() * 4);
    render();
  }, 3000);


  // =======================
  // INIT FIRST RENDER
  // =======================
  render();

});
