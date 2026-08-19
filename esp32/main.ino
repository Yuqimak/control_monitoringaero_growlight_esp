// ============================================
// ESP32 - SIGMA GROWLIGHT (FINAL STABLE)
// ============================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <DHT.h>
#include <RTClib.h>
#include <BH1750.h>
#include <LiquidCrystal_I2C.h>
#include <NTPClient.h>
#include <WiFiUdp.h>

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
// KONSTANTA INTERVAL
// ============================================
#define OVERHEAT_THRESHOLD 34.0
#define SENSOR_INTERVAL     5000      // 5 detik
#define CONFIG_INTERVAL     10000     // 10 detik
#define STATE_INTERVAL      10000     // 10 detik
#define HISTORY_INTERVAL    300000    // 5 MENIT (PASTI!)
#define LCD_INTERVAL        10000     // 10 detik
#define NTP_SYNC_INTERVAL   3600000   // 1 jam

// ============================================
// OBJEK SENSOR
// ============================================
DHT dht(DHTPIN, DHTTYPE);
RTC_DS3231 rtc;
BH1750 lightMeter;
LiquidCrystal_I2C lcd(0x27, 16, 2);
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 7 * 3600, 60000);

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
unsigned long lastNTPSync = 0;
bool lastLampState = false;
bool lcdPage = false;

// ============================================
// FUNGSI BANTU - TIMESTAMP
// ============================================
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
// SINKRONISASI RTC DENGAN NTP
// ============================================
void syncRTC() {
  timeClient.update();
  unsigned long epochTime = timeClient.getEpochTime();
  rtc.adjust(DateTime(epochTime));
  Serial.println("[✓] RTC disinkronkan dengan NTP");
  Serial.print("Waktu: ");
  Serial.println(getHumanTimestamp(rtc.now()));
}

// ============================================
// BACA KONFIGURASI DARI FIREBASE
// ============================================
void bacaKonfigurasi() {
  HTTPClient http;
  http.setTimeout(3000);

  String url = String(FIREBASE_HOST) + "/system/mode.json";
  http.begin(url);
  int code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    if (res.startsWith("\"") && res.endsWith("\"")) res = res.substring(1, res.length() - 1);
    if (res == "otomatis" || res == "jadwal" || res == "manual") controlMode = res;
  }
  http.end();

  url = String(FIREBASE_HOST) + "/system/state.json";
  http.begin(url);
  code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    manualState = (res == "true");
  }
  http.end();

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

  url = String(FIREBASE_HOST) + "/system/force_day_on.json";
  http.begin(url);
  code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    forceDayOn = (res == "true");
  }
  http.end();

  url = String(FIREBASE_HOST) + "/system/last_reset_date.json";
  http.begin(url);
  code = http.GET();
  if (code > 0) {
    String res = http.getString();
    res.trim();
    if (res.startsWith("\"") && res.endsWith("\"")) res = res.substring(1, res.length() - 1);
    lastResetDate = res;
  }
  http.end();
}

// ============================================
// KIRIM SENSOR
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
// KIRIM STATE
// ============================================
void kirimState() {
  HTTPClient http;
  bool success = false;
  int retry = 0;

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
// KIRIM HISTORY - FORMAT PER TIMESTAMP (DENGAN RETRY)
// ============================================
void kirimHistory() {
  HTTPClient http;
  DateTime now = rtc.now();
  String timestamp = getTimestamp(now);

  String payload = "{";
  payload += "\"" + timestamp + "\":{";
  payload += "\"cahaya\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String((int)lux) + "},";
  payload += "\"kelembapan\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String(hum, 1) + "},";
  payload += "\"lampu\":{\"state\":" + String(lampState ? "true" : "false") + ",\"timestamp\":\"" + timestamp + "\"},";
  payload += "\"suhu\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String(suhu, 1) + "}";
  payload += "}}";

  String url = String(FIREBASE_HOST) + "/sensor_history.json";
  
  int retry = 0;
  int code = 0;
  while (retry < 3 && code != 200) {
    http.begin(url);
    http.setTimeout(5000);
    http.addHeader("Content-Type", "application/json");
    code = http.PATCH(payload);
    http.end();
    retry++;
    if (code != 200) {
      Serial.print("[✗] Retry "); Serial.print(retry); Serial.print(" HTTP: "); Serial.println(code);
      delay(1000);
    }
  }
  
  if (code == 200) {
    Serial.println("[✓] History terkirim (format per timestamp)");
  } else {
    Serial.println("[✗] Gagal kirim history setelah 3x retry");
  }
}

// ============================================
// KIRIM HISTORY LAMPU SAAT BERUBAH
// ============================================
void kirimHistoryLampu(bool state) {
  HTTPClient http;
  DateTime now = rtc.now();
  String timestamp = getTimestamp(now);

  String payload = "{";
  payload += "\"" + timestamp + "\":{";
  payload += "\"cahaya\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String((int)lux) + "},";
  payload += "\"kelembapan\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String(hum, 1) + "},";
  payload += "\"lampu\":{\"state\":" + String(state ? "true" : "false") + ",\"timestamp\":\"" + timestamp + "\"},";
  payload += "\"suhu\":{\"timestamp\":\"" + timestamp + "\",\"value\":" + String(suhu, 1) + "}";
  payload += "}}";

  String url = String(FIREBASE_HOST) + "/sensor_history.json";
  
  int retry = 0;
  int code = 0;
  while (retry < 3 && code != 200) {
    http.begin(url);
    http.setTimeout(5000);
    http.addHeader("Content-Type", "application/json");
    code = http.PATCH(payload);
    http.end();
    retry++;
    if (code != 200) {
      Serial.print("[✗] Retry "); Serial.print(retry); Serial.print(" HTTP: "); Serial.println(code);
      delay(1000);
    }
  }
  
  if (code == 200) {
    Serial.println("[✓] History lampu terkirim");
  } else {
    Serial.println("[✗] Gagal kirim history lampu");
  }
}

// ============================================
// KIRIM DAILY HISTORY
// ============================================
void kirimDailyHistory() {
  HTTPClient http;
  DateTime now = rtc.now();
  String today = getDateString(now);
  String humanTime = getHumanTimestamp(now);

  String status = "🌙 Mati";
  if (accumulatedLight >= totalLightNeeded) status = "✅ Cukup";
  else if (accumulatedLight >= totalLightNeeded * 0.5) status = "🟡 Sedang";
  else if (accumulatedLight > 0) status = "🔴 Kurang";

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
// CEK PERGANTIAN HARI
// ============================================
bool cekGantiHari() {
  DateTime now = rtc.now();
  String today = getDateString(now);
  if (todayDate != today) {
    if (todayDate != "") kirimDailyHistory();
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
  suhu = dht.readTemperature();
  hum = dht.readHumidity();
  lux = lightMeter.readLightLevel();
  if (isnan(suhu)) suhu = 0;
  if (isnan(hum)) hum = 0;
  if (isnan(lux)) lux = 0;

  if (suhu > OVERHEAT_THRESHOLD) {
    digitalWrite(RELAY_PIN, HIGH);
    statusRelay = "OFF";
    lampState = false;
    kirimState();
    return;
  }

  bool prevLampState = lampState;
  DateTime now = rtc.now();
  int jam = now.hour();

  if (controlMode == "manual") {
    lampState = manualState;
  } else if (controlMode == "jadwal") {
    bool isScheduled = false;
    if (jadwalStart < jadwalEnd) isScheduled = (jam >= jadwalStart && jam < jadwalEnd);
    else isScheduled = (jam >= jadwalStart || jam < jadwalEnd);
    lampState = isScheduled;
  } else {
    bool isRestTime = (jam >= 18 || jam < 6);
    if (isRestTime) {
      lampState = false;
    } else {
      if (forceDayOn) {
        lampState = true;
      } else {
        lampState = (accumulatedLight < totalLightNeeded);
      }
    }
  }

  if (lampState) {
    accumulatedLight += (SENSOR_INTERVAL / 3600000.0);
    if (accumulatedLight > totalLightNeeded) accumulatedLight = totalLightNeeded;
  }

  digitalWrite(RELAY_PIN, lampState ? LOW : HIGH);
  statusRelay = lampState ? "ON" : "OFF";

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

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SIGMA");
  lcd.setCursor(0, 1);
  lcd.print("Starting...");
  delay(2000);
  lcd.clear();

  dht.begin();
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);

  if (!rtc.begin()) {
    Serial.println("[✗] RTC ERROR");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("RTC ERROR!");
    while (1);
  }

  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("[✗] BH1750 ERROR");
  }

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

  // ⭐ SINKRONISASI RTC DENGAN NTP
  timeClient.begin();
  syncRTC();

  bacaKonfigurasi();

  Serial.println("[✓] ESP32 SIGMA FINAL STABLE");
  Serial.print("[✓] Overheat: "); Serial.println(OVERHEAT_THRESHOLD);
  Serial.print("[✓] Kebutuhan: "); Serial.println(totalLightNeeded);
  Serial.println("[✓] Data akan dikirim setiap 5 MENIT");
}

// ============================================
// LOOP UTAMA
// ============================================
void loop() {
  unsigned long now = millis();

  // ⭐ SINKRONISASI NTP SETIAP 1 JAM
  if (now - lastNTPSync > NTP_SYNC_INTERVAL) {
    lastNTPSync = now;
    syncRTC();
  }

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
