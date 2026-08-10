// ============================================
// ESP32 - SIGMA GROWLIGHT (INDOOR - TANPA KIRIM MODE)
// ============================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <DHT.h>
#include <RTClib.h>
#include <BH1750.h>
#include <LiquidCrystal_I2C.h>

// ============================================
// KONFIGURASI WIFI
// ============================================
const char* ssid = "KRIUK";
const char* password = "12345!@#$&";

// ============================================
// KONFIGURASI FIREBASE
// ============================================
#define FIREBASE_HOST "https://growlightta-default-rtdb.asia-southeast1.firebasedatabase.app"

// ============================================
// PIN & SENSOR
// ============================================
#define DHTPIN 4
#define DHTTYPE DHT22
#define RELAY_PIN 26

// ============================================
// KONSTANTA
// ============================================
#define OVERHEAT_THRESHOLD 34.0
#define SENSOR_INTERVAL 5000        // 5 DETIK
#define STATE_INTERVAL 30000        // 30 DETIK
#define HISTORY_INTERVAL 300000     // 5 MENIT
#define LCD_INTERVAL 10000          // 10 DETIK

// ============================================
// OBJEK SENSOR
// ============================================
DHT dht(DHTPIN, DHTTYPE);
RTC_DS3231 rtc;
BH1750 lightMeter;
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ============================================
// VARIABEL GLOBAL
// ============================================
float suhu = 0, hum = 0, lux = 0;
String statusRelay = "OFF";
bool lampState = false;
float accumulatedLight = 0.0;
float totalLightNeeded = 12.0;
String lastResetDate = "";
String controlMode = "otomatis";
bool manualState = false;
int luxThreshold = 400;
bool forceDayOn = false;
int jadwalStart = 6;
int jadwalEnd = 18;
String todayDate = "";

unsigned long lastSensorSend = 0;
unsigned long lastStateSend = 0;
unsigned long lastHistorySend = 0;
unsigned long lastLCDUpdate = 0;
bool lastLampState = false;
bool lcdPage = false;

// ============================================
// FUNGSI BANTU
// ============================================
String getTimestamp(DateTime now) {
  String ts = String(now.year()) + "-" + String(now.month()) + "-" + String(now.day()) +
              "T" + String(now.hour()) + "-" + String(now.minute()) + "-" + String(now.second()) + "-000Z";
  return ts;
}

String getDateString(DateTime now) {
  return String(now.year()) + "-" + String(now.month()) + "-" + String(now.day());
}

// ============================================
// BACA KONFIGURASI DARI FIREBASE
// ============================================
void bacaKonfigurasi() {
  HTTPClient http;
  http.setTimeout(3000);

  // 1. BACA MODE DARI system/mode (CUMA BACA, GAK NULIS!)
  String url = String(FIREBASE_HOST) + "/system/mode.json";
  http.begin(url);
  int code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    if (res.startsWith("\"") && res.endsWith("\"")) {
      res = res.substring(1, res.length() - 1);
    }
    if (res == "otomatis" || res == "jadwal" || res == "manual") {
      controlMode = res;
      Serial.print("[✓] Mode: ");
      Serial.println(controlMode);
    }
  }
  http.end();

  // 2. BACA STATE (MANUAL)
  url = String(FIREBASE_HOST) + "/system/state.json";
  http.begin(url);
  code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    manualState = (res == "true");
    Serial.print("[✓] State: ");
    Serial.println(manualState ? "ON" : "OFF");
  }
  http.end();

  // 3. BACA TOTAL LIGHT NEEDED
  url = String(FIREBASE_HOST) + "/system/total_light_needed.json";
  http.begin(url);
  code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    if (res.length() > 0 && res != "null") {
      float val = res.toFloat();
      if (val >= 6 && val <= 18) totalLightNeeded = val;
    }
  }
  http.end();

  // 4. BACA JADWAL
  url = String(FIREBASE_HOST) + "/system/jadwal_start.json";
  http.begin(url);
  code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    if (res.length() > 0 && res != "null") {
      int val = res.toInt();
      if (val >= 0 && val <= 23) jadwalStart = val;
    }
  }
  http.end();

  url = String(FIREBASE_HOST) + "/system/jadwal_end.json";
  http.begin(url);
  code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    if (res.length() > 0 && res != "null") {
      int val = res.toInt();
      if (val >= 0 && val <= 23) jadwalEnd = val;
    }
  }
  http.end();

  // 5. BACA FORCE DAY ON
  url = String(FIREBASE_HOST) + "/system/force_day_on.json";
  http.begin(url);
  code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    forceDayOn = (res == "true");
  }
  http.end();

  // 6. BACA LAST RESET DATE
  url = String(FIREBASE_HOST) + "/system/last_reset_date.json";
  http.begin(url);
  code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    if (res.startsWith("\"") && res.endsWith("\"")) {
      res = res.substring(1, res.length() - 1);
    }
    lastResetDate = res;
  }
  http.end();
}

// ============================================
// KIRIM SENSOR (5 DETIK)
// ============================================
void kirimSensor() {
  HTTPClient http;
  String sensorPayload = "{";
  sensorPayload += "\"suhu\":" + String(suhu) + ",";
  sensorPayload += "\"cahaya\":" + String((int)lux) + ",";
  sensorPayload += "\"updatedAt\":" + String(rtc.now().unixtime());
  sensorPayload += "}";

  String url = String(FIREBASE_HOST) + "/sensor.json";
  http.begin(url);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.PUT(sensorPayload);
  http.end();
}

// ============================================
// KIRIM STATE & ACCUMULATED (30 DETIK)
// ============================================
void kirimState() {
  HTTPClient http;

  String statePayload = String(lampState ? "true" : "false");
  String url = String(FIREBASE_HOST) + "/system/state.json";
  http.begin(url);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.PUT(statePayload);
  http.end();

  url = String(FIREBASE_HOST) + "/system/accumulated_light.json";
  http.begin(url);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.PUT(String(accumulatedLight, 6));
  http.end();
}

// ============================================
// KIRIM HISTORY (5 MENIT)
// ============================================
void kirimHistory() {
  HTTPClient http;
  DateTime now = rtc.now();
  String timestamp = getTimestamp(now);

  // History suhu
  String historyPayload = "{\"" + timestamp + "\":{\"value\":" + String(suhu) + ",\"timestamp\":\"" + timestamp + "\"}}";
  String url = String(FIREBASE_HOST) + "/sensor_history/suhu.json";
  http.begin(url);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.PATCH(historyPayload);
  http.end();

  // History cahaya
  historyPayload = "{\"" + timestamp + "\":{\"value\":" + String((int)lux) + ",\"timestamp\":\"" + timestamp + "\"}}";
  url = String(FIREBASE_HOST) + "/sensor_history/cahaya.json";
  http.begin(url);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.PATCH(historyPayload);
  http.end();

  // History lampu
  historyPayload = "{\"" + timestamp + "\":{\"state\":" + String(lampState ? "true" : "false") + ",\"timestamp\":\"" + timestamp + "\"}}";
  url = String(FIREBASE_HOST) + "/sensor_history/lampu.json";
  http.begin(url);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.PATCH(historyPayload);
  http.end();

  Serial.println("[✓] History sensor terkirim");
}

// ============================================
// KIRIM DAILY HISTORY (1x/HARI)
// ============================================
void kirimDailyHistory() {
  HTTPClient http;
  DateTime now = rtc.now();
  String today = getDateString(now);

  String payload = "{";
  payload += "\"growlight\":" + String(accumulatedLight) + ",";
  payload += "\"total\":" + String(accumulatedLight);
  payload += "}";

  String url = String(FIREBASE_HOST) + "/daily_history/" + today + ".json";
  http.begin(url);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.PUT(payload);
  http.end();

  Serial.println("[✓] Daily history: " + today);
}

// ============================================
// CEK GANTI HARI (RESET ACCUMULATED)
// ============================================
bool cekGantiHari() {
  DateTime now = rtc.now();
  String today = getDateString(now);
  if (todayDate != today) {
    if (todayDate != "") {
      kirimDailyHistory();
    }
    accumulatedLight = 0.0;
    todayDate = today;
    Serial.println("[✓] Reset harian: " + today);
    return true;
  }
  return false;
}

// ============================================
// KIRIM HISTORY LAMPU (SAAT BERUBAH)
// ============================================
void kirimHistoryLampu(bool state) {
  HTTPClient http;
  DateTime now = rtc.now();
  String timestamp = getTimestamp(now);
  String historyPayload = "{\"" + timestamp + "\":{\"state\":" + String(state ? "true" : "false") + ",\"timestamp\":\"" + timestamp + "\"}}";
  String url = String(FIREBASE_HOST) + "/sensor_history/lampu.json";
  http.begin(url);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.PATCH(historyPayload);
  http.end();
}

// ============================================
// KONTROL LAMPU (INDOOR - TANPA MATAHARI)
// ============================================
void kontrolLampu() {
  // Baca sensor
  suhu = dht.readTemperature();
  hum = dht.readHumidity();
  lux = lightMeter.readLightLevel();
  if (isnan(suhu)) suhu = 0;
  if (isnan(hum)) hum = 0;
  if (isnan(lux)) lux = 0;

  // OVERHEAT (PRIORITAS TERTINGGI)
  if (suhu > OVERHEAT_THRESHOLD) {
    digitalWrite(RELAY_PIN, HIGH);
    statusRelay = "OFF";
    lampState = false;
    kirimState();
    return;
  }

  DateTime now = rtc.now();
  int jam = now.hour();

  // CEK WAKTU ISTIRAHAT (18:00 - 06:00)
  bool isRestTime = (jam >= 18 || jam < 6);

  // LOGIKA KONTROL SESUAI MODE (mode dari Firebase)
  if (controlMode == "manual") {
    // MANUAL: ikut system/state dari web
    lampState = manualState;
  } else if (controlMode == "jadwal") {
    // JADWAL: ikut jam
    bool isScheduled = false;
    if (jadwalStart < jadwalEnd) {
      isScheduled = (jam >= jadwalStart && jam < jadwalEnd);
    } else {
      isScheduled = (jam >= jadwalStart || jam < jadwalEnd);
    }
    lampState = isScheduled;
  } else {
    // OTOMATIS (INDOOR): nyala kalo accumulated < 12 DAN bukan waktu istirahat
    if (isRestTime) {
      lampState = false;
    } else {
      if (forceDayOn) {
        lampState = true;
      } else {
        // Tambah accumulated SELAMA lampu ON
        if (lampState == true) {
          accumulatedLight += (SENSOR_INTERVAL / 3600000.0);
          if (accumulatedLight > totalLightNeeded) {
            accumulatedLight = totalLightNeeded;
          }
        }
        // Tentukan status lampu berikutnya
        lampState = (accumulatedLight < totalLightNeeded);
      }
    }
  }

  // EKSEKUSI RELAY
  digitalWrite(RELAY_PIN, lampState ? LOW : HIGH);
  statusRelay = lampState ? "ON" : "OFF";

  // Kirim history jika status lampu berubah
  if (lampState != lastLampState) {
    kirimHistoryLampu(lampState);
    lastLampState = lampState;
  }
}

// ============================================
// UPDATE LCD (CENTER + 10 DETIK)
// ============================================
void updateLCD() {
  DateTime now = rtc.now();
  lcd.clear();

  if (!lcdPage) {
    String waktu = "";
    if (now.hour() < 10) waktu += "0";
    waktu += String(now.hour()) + ":";
    if (now.minute() < 10) waktu += "0";
    waktu += String(now.minute()) + ":";
    if (now.second() < 10) waktu += "0";
    waktu += String(now.second());

    String tanggal = String(now.day()) + "/" + String(now.month()) + "/" + String(now.year());

    int spasiWaktu = (16 - waktu.length()) / 2;
    int spasiTanggal = (16 - tanggal.length()) / 2;

    lcd.setCursor(spasiWaktu, 0);
    lcd.print(waktu);
    lcd.setCursor(spasiTanggal, 1);
    lcd.print(tanggal);
  } else {
    String tempStr = "T:" + String(suhu, 1) + "C";
    String lightStr = "L:" + String((int)lux) + "lx";
    String relayStr = "R:" + String(statusRelay);
    String accStr = "A:" + String(accumulatedLight, 2) + "h";

    String baris0 = tempStr + " " + lightStr;
    String baris1 = relayStr + " " + accStr;

    int spasi0 = (16 - baris0.length()) / 2;
    int spasi1 = (16 - baris1.length()) / 2;

    lcd.setCursor(spasi0, 0);
    lcd.print(baris0);
    lcd.setCursor(spasi1, 1);
    lcd.print(baris1);
  }

  lcdPage = !lcdPage;
}

// ============================================
// SETUP
// ============================================
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);

  // LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SIGMA");
  lcd.setCursor(0, 1);
  lcd.print("Starting...");
  delay(2000);
  lcd.clear();

  // SENSOR
  dht.begin();
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);

  // RTC
  if (!rtc.begin()) {
    Serial.println("[✗] RTC ERROR");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("RTC ERROR!");
    while (1);
  }

  if (rtc.lostPower()) {
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }

  // BH1750
  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("[✗] BH1750 ERROR");
  }

  // WIFI
  WiFi.begin(ssid, password);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi: Connecting");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[✓] WiFi Connected");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi: OK");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
  } else {
    Serial.println("\n[✗] WiFi GAGAL");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi: FAILED!");
  }
  delay(2000);
  lcd.clear();

  // BACA KONFIGURASI AWAL
  bacaKonfigurasi();

  Serial.println("[✓] ESP32 SIGMA siap (INDOOR)");
  Serial.print("[✓] Overheat: ");
  Serial.println(OVERHEAT_THRESHOLD);
  Serial.print("[✓] Kebutuhan: ");
  Serial.println(totalLightNeeded);
  Serial.println("[✓] LCD ganti 10 detik");
}

// ============================================
// LOOP
// ============================================
void loop() {
  unsigned long now = millis();

  // 5 DETIK: BACA SENSOR & KONTROL
  if (now - lastSensorSend > SENSOR_INTERVAL) {
    lastSensorSend = now;
    kontrolLampu();
    kirimSensor();

    Serial.println("==========================");
    Serial.print("Suhu: "); Serial.print(suhu); Serial.println(" C");
    Serial.print("Lux: "); Serial.println(lux);
    Serial.print("Relay: "); Serial.println(statusRelay);
    Serial.print("Mode: "); Serial.println(controlMode);
    Serial.print("Accumulated: "); Serial.print(accumulatedLight); Serial.println(" jam");
    Serial.print("Kebutuhan: "); Serial.println(totalLightNeeded);
  }

  // 30 DETIK: KIRIM STATE & ACCUMULATED
  if (now - lastStateSend > STATE_INTERVAL) {
    lastStateSend = now;
    kirimState();
  }

  // 5 MENIT: KIRIM HISTORY
  if (now - lastHistorySend > HISTORY_INTERVAL) {
    lastHistorySend = now;
    kirimHistory();
  }

  // CEK GANTI HARI (RESET ACCUMULATED)
  cekGantiHari();

  // 10 DETIK: LCD
  if (now - lastLCDUpdate > LCD_INTERVAL) {
    lastLCDUpdate = now;
    updateLCD();
  }

  delay(100);
}
