// ============================================
// ESP32 - SIGMA GROWLIGHT (INDOOR FARMING)
// REVISI FINAL: Format History per Timestamp
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
// KONSTANTA INTERVAL (WAKTU)
// ============================================
#define OVERHEAT_THRESHOLD 34.0
#define SENSOR_INTERVAL     5000      // 5 detik
#define CONFIG_INTERVAL     10000     // 10 detik
#define STATE_INTERVAL      10000     // 10 detik
#define HISTORY_INTERVAL    300000    // 5 menit
#define LCD_INTERVAL        10000     // 10 detik

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
bool forceDayOn = false;
int jadwalStart = 6;
int jadwalEnd = 18;
String todayDate = "";

unsigned long lastSensorSend = 0;
unsigned long lastConfigRead = 0;
unsigned long lastStateSend = 0;
unsigned long lastHistorySend = 0;
unsigned long lastLCDUpdate = 0;
bool lastLampState = false;
bool lcdPage = false;

// ===================================
// FUNGSI BANTU - TIMESTAMP MANUSIA
// ===================================
String getHumanTimestamp(DateTime now) {
  char buffer[25];
  sprintf(buffer, "%04d-%02d-%02d %02d:%02d:%02d",
    now.year(), now.month(), now.day(),
    now.hour(), now.minute(), now.second()
  );
  return String(buffer);
}

String getTimestamp(DateTime now) {
  String ts = String(now.year()) + "-" + String(now.month()) + "-" + String(now.day()) +
              "T" + String(now.hour()) + "-" + String(now.minute()) + "-" + String(now.second()) + "-000Z";
  return ts;
}

String getDateString(DateTime now) {
  return String(now.year()) + "-" + String(now.month()) + "-" + String(now.day());
}

// ============================================
// BACA KONFIGURASI DARI FIREBASE (10 DETIK)
// ============================================
void bacaKonfigurasi() {
  HTTPClient http;
  http.setTimeout(3000);

  // 1. BACA MODE
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
    }
  }
  http.end();

  // 2. BACA PERINTAH MANUAL
  url = String(FIREBASE_HOST) + "/system/state.json";
  http.begin(url);
  code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    manualState = (res == "true");
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

  // 4. BACA JADWAL START
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

  // 5. BACA JADWAL END
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

  // 6. BACA FORCE DAY ON
  url = String(FIREBASE_HOST) + "/system/force_day_on.json";
  http.begin(url);
  code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    forceDayOn = (res == "true");
  }
  http.end();

  // 7. BACA LAST RESET DATE
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
// KIRIM SENSOR - DENGAN TIMESTAMP MANUSIA
// ============================================
void kirimSensor() {
  HTTPClient http;
  DateTime now = rtc.now();
  String humanTime = getHumanTimestamp(now);
  
  String sensorPayload = "{";
  sensorPayload += "\"suhu\":" + String(suhu) + ",";
  sensorPayload += "\"kelembapan\":" + String(hum) + ",";
  sensorPayload += "\"cahaya\":" + String((int)lux) + ",";
  sensorPayload += "\"updatedAt\":\"" + humanTime + "\"";
  sensorPayload += "}";

  String url = String(FIREBASE_HOST) + "/sensor.json";
  http.begin(url);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.PUT(sensorPayload);
  http.end();
}

// ============================================
// KIRIM STATE - DENGAN RETRY
// ============================================
void kirimState() {
  HTTPClient http;
  bool success = false;
  int retry = 0;

  // KIRIM accumulated_light
  while (!success && retry < 3) {
    String url = String(FIREBASE_HOST) + "/system/accumulated_light.json";
    http.begin(url);
    http.setTimeout(3000);
    http.addHeader("Content-Type", "application/json");
    int code = http.PUT(String(accumulatedLight, 6));
    if (code == 200) success = true;
    http.end();
    retry++;
    if (!success) delay(100);
  }

  // KIRIM actual_state
  success = false;
  retry = 0;
  while (!success && retry < 3) {
    String url = String(FIREBASE_HOST) + "/system/actual_state.json";
    http.begin(url);
    http.setTimeout(3000);
    http.addHeader("Content-Type", "application/json");
    int code = http.PUT(lampState ? "true" : "false");
    if (code == 200) success = true;
    http.end();
    retry++;
    if (!success) delay(100);
  }
}

// ============================================
// KIRIM HISTORY SENSOR - FORMAT PER TIMESTAMP
// ============================================
void kirimHistory() {
  HTTPClient http;
  DateTime now = rtc.now();
  String timestamp = getTimestamp(now);

  // Buat payload 1 node lengkap per timestamp
  String payload = "{";
  payload += "\"" + timestamp + "\":{";
  payload += "\"cahaya\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String((int)lux) + "},";
  payload += "\"kelembapan\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String(hum, 1) + "},";
  payload += "\"lampu\":{\"state\":" + String(lampState ? "true" : "false") + ",\"timestamp\":\"" + timestamp + "\"},";
  payload += "\"suhu\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String(suhu, 1) + "}";
  payload += "}}";

  // Kirim PATCH ke /sensor_history.json
  String url = String(FIREBASE_HOST) + "/sensor_history.json";
  http.begin(url);
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  int code = http.PATCH(payload);

  if (code == 200) {
    Serial.println("[✓] History terkirim (format per timestamp)");
  } else {
    Serial.print("[✗] Gagal kirim history. HTTP: ");
    Serial.println(code);
  }
  http.end();
}

// ============================================
// KIRIM HISTORY LAMPU SAAT BERUBAH
// ============================================
void kirimHistoryLampu(bool state) {
  HTTPClient http;
  DateTime now = rtc.now();
  String timestamp = getTimestamp(now);

  // Baca sensor terakhir (suhu, hum, lux) dari variabel global
  String payload = "{";
  payload += "\"" + timestamp + "\":{";
  payload += "\"cahaya\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String((int)lux) + "},";
  payload += "\"kelembapan\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String(hum, 1) + "},";
  payload += "\"lampu\":{\"state\":" + String(state ? "true" : "false") + ",\"timestamp\":\"" + timestamp + "\"},";
  payload += "\"suhu\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String(suhu, 1) + "}";
  payload += "}}";

  String url = String(FIREBASE_HOST) + "/sensor_history.json";
  http.begin(url);
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  int code = http.PATCH(payload);

  if (code == 200) {
    Serial.println("[✓] History lampu terkirim (format per timestamp)");
  } else {
    Serial.print("[✗] Gagal kirim history lampu. HTTP: ");
    Serial.println(code);
  }
  http.end();
}

// ============================================
// KIRIM DAILY HISTORY - DENGAN TIMESTAMP MANUSIA
// ============================================
void kirimDailyHistory() {
  HTTPClient http;
  DateTime now = rtc.now();
  String today = getDateString(now);
  String humanTime = getHumanTimestamp(now);

  //  HITUNG STATUS
  String status = "🌙 Mati";
  if (accumulatedLight >= totalLightNeeded) {
    status = "✅ Cukup";
  } else if (accumulatedLight >= totalLightNeeded * 0.5) {
    status = "🟡 Sedang";
  } else if (accumulatedLight > 0) {
    status = "🔴 Kurang";
  }

  String payload = "{";
  payload += "\"growlight\":" + String(accumulatedLight, 6) + ",";
  payload += "\"target\":" + String(totalLightNeeded) + ",";
  payload += "\"status\":\"" + status + "\",";
  payload += "\"updatedAt\":\"" + humanTime + "\"";
  payload += "}";

  String url = String(FIREBASE_HOST) + "/daily_history/" + today + ".json";
  http.begin(url);
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  http.PUT(payload);
  http.end();

  Serial.println("[✓] Daily history: " + today);
}

// ============================================
// CEK PERGANTIAN HARI (RESET ACCUMULATED)
// ============================================
bool cekGantiHari() {
  DateTime now = rtc.now();
  String today = getDateString(now);
  if (todayDate != today) {
    if (todayDate != "") {
      kirimDailyHistory();   // Kirim laporan kemarin
    }
    accumulatedLight = 0.0;
    todayDate = today;
    Serial.println("[✓] Reset harian: " + today);
    return true;
  }
  return false;
}

// ============================================
// KONTROL LAMPU
// ============================================
void kontrolLampu() {
  // 1. BACA SENSOR
  suhu = dht.readTemperature();
  hum = dht.readHumidity();
  lux = lightMeter.readLightLevel();
  if (isnan(suhu)) suhu = 0;
  if (isnan(hum)) hum = 0;
  if (isnan(lux)) lux = 0;

  // 2. PRIORITAS: OVERHEAT
  if (suhu > OVERHEAT_THRESHOLD) {
    digitalWrite(RELAY_PIN, HIGH);
    statusRelay = "OFF";
    lampState = false;
    kirimState();
    return;
  }

  // 3. SIMPAN STATUS LAMA
  bool prevLampState = lampState;
  DateTime now = rtc.now();
  int jam = now.hour();

  // 4. TENTUKAN STATUS LAMPU
  if (controlMode == "manual") {
    lampState = manualState;
  } 
  else if (controlMode == "jadwal") {
    bool isScheduled = false;
    if (jadwalStart < jadwalEnd) {
      isScheduled = (jam >= jadwalStart && jam < jadwalEnd);
    } else {
      isScheduled = (jam >= jadwalStart || jam < jadwalEnd);
    }
    lampState = isScheduled;
  } 
  else { // OTOMATIS
    bool isRestTime = (jam >= 18 || jam < 6);
    if (isRestTime) {
      lampState = false;
    } else {
      if (forceDayOn) {
        lampState = true;
      } else {
        // LOGIKA INTI: ON jika akumulasi < target
        lampState = (accumulatedLight < totalLightNeeded);
      }
    }
  }

  // 5. HITUNG DURASI ON (SETELAH STATUS DITENTUKAN)
  if (lampState) {
    accumulatedLight += (SENSOR_INTERVAL / 3600000.0);
    if (accumulatedLight > totalLightNeeded) {
      accumulatedLight = totalLightNeeded;
    }
  }

  // 6. EKSEKUSI RELAY
  digitalWrite(RELAY_PIN, lampState ? LOW : HIGH);
  statusRelay = lampState ? "ON" : "OFF";

  // 7. KIRIM HISTORY JIKA STATUS BERUBAH
  if (lampState != prevLampState) {
    kirimHistoryLampu(lampState);
    Serial.print("🔄 Status berubah: ");
    Serial.println(lampState ? "ON" : "OFF");
  }

  lastLampState = lampState;
}

// ============================================
// UPDATE LCD
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
// LOOP UTAMA
// ============================================
void loop() {
  unsigned long now = millis();

  if (now - lastSensorSend > SENSOR_INTERVAL) {
    lastSensorSend = now;
    kontrolLampu();
    kirimSensor();

    Serial.println("==========================");
    Serial.print("Suhu: "); Serial.print(suhu); Serial.println(" C");
    Serial.print("Kelembapan: "); Serial.print(hum); Serial.println(" %");
    Serial.print("Lux: "); Serial.println(lux);
    Serial.print("Relay: "); Serial.println(statusRelay);
    Serial.print("Mode: "); Serial.println(controlMode);
    Serial.print("Accumulated: "); Serial.print(accumulatedLight); Serial.println(" jam");
    Serial.print("Kebutuhan: "); Serial.println(totalLightNeeded);
  }

  if (now - lastConfigRead > CONFIG_INTERVAL) {
    lastConfigRead = now;
    bacaKonfigurasi();
  }

  if (now - lastStateSend > STATE_INTERVAL) {
    lastStateSend = now;
    kirimState();
  }

  if (now - lastHistorySend > HISTORY_INTERVAL) {
    lastHistorySend = now;
    kirimHistory();
  }

  cekGantiHari();

  if (now - lastLCDUpdate > LCD_INTERVAL) {
    lastLCDUpdate = now;
    updateLCD();
  }

  delay(100);
}
