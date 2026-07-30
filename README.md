# 🌱 IoT Greenhouse Monitoring & Control

Sistem IoT untuk monitoring dan kontrol otomatis greenhouse berbasis **ESP32**, **Firebase Realtime Database**, dan **Web Dashboard**.  
Proyek ini dirancang untuk mengontrol lampu pertumbuhan tanaman secara otomatis berdasarkan **jadwal**, **intensitas cahaya (lux)**, dan **suhu**.

---

## 📋 **Fitur Utama**

| Fitur | Keterangan |
| :--- | :--- |
| **3 Mode Kontrol** | Manual, Jadwal, Otomatis (dengan Repeat Cycle 15 menit) |
| **Monitoring Realtime** | Suhu, Intensitas Cahaya (lux), Status Lampu |
| **Kontrol Jarak Jauh** | Web dashboard dapat diakses dari HP/PC |
| **Overheat Protection** | Lampu otomatis mati jika suhu > 34°C |
| **Repeat Cycle (RC)** | Siklus ON/OFF 15 menit di mode Otomatis |
| **History Data** | Data sensor tersimpan setiap 5 menit (hemat kuota) |
| **Analytics** | Grafik suhu, cahaya, status lampu, statistik harian |
| **Export Data** | Unduh data dalam format CSV / PDF |
| **Multi-User** | Login dengan role Petani / Admin |

---

## 🛠️ **Teknologi yang Digunakan**

| Komponen | Teknologi |
| :--- | :--- |
| **Hardware** | ESP32, DHT22, BH1750, RTC DS3231, Relay, LCD I2C |
| **Backend** | Firebase Realtime Database |
| **Frontend** | HTML, CSS, JavaScript (Chart.js, jsPDF) |
| **Hosting** | GitHub Pages |
| **IDE** | Arduino IDE |

---

## 📁 **Struktur Proyek**
control_monitoringaero_growlight_esp/
├── index.html # Halaman utama dashboard
├── login.html # Halaman login
├── css/
│ └── style.css # Styling dashboard
├── js/
│ ├── app.js # Main entry (Opsi 1)
│ ├── firebase.js # Konfigurasi Firebase
│ └── modules/
│ ├── admin.js # Manajemen user
│ ├── analytics.js # Charts & statistik
│ ├── core.js # State & DOM
│ └── ui.js # Render UI
├── esp32/
│ └── main.ino # Kode ESP32 (terbaru)
└── README.md

---

## 🚀 **Cara Setup**

### 1. **Firebase**
1. Buat project di [Firebase Console](https://console.firebase.google.com).
2. Aktifkan **Realtime Database**.
3. Salin `firebaseConfig` ke `js/firebase.js`.
4. Atur **Rules** seperti di bawah:

```json
{
  "rules": {
    ".read": true,
    ".write": false,
    "sensor": { ".write": true },
    "sensor_history": { ".write": true },
    "control": { ".write": true },
    "system": { ".write": true },
    "users": { ".write": true }
  }
}
