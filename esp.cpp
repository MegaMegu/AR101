// RFID + LCD + Buzzer + Send UID to Google Apps Script (ESP8266 NodeMCU V3)
// Libraries
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <ESP8266HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ====== CONFIG - edit these ======
const char* ssid     = "YOUR_WIFI_NAME";
const char* password = "YOUR_WIFI_PASSWORD";
// Google Apps Script web app (use the HTTPS URL)
const char* serverName = "https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec";
// =================================

// Pin definitions (use NodeMCU D# labels)
#define RST_PIN D4   // RC522 RST
#define SS_PIN  D8   // RC522 SDA (SS)

// Buzzer pin
#define BUZZER_PIN D0

// Objects
MFRC522 mfrc522(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 16, 2); // common address 0x27 or 0x3F (change if needed)

// Debounce / read control
unsigned long lastSendMillis = 0;
const unsigned long sendInterval = 2000; // ms - minimal time between sends

void setup() {
  Serial.begin(115200);
  delay(10);

  // Buzzer pin
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Init LCD (explicitly set I2C pins for ESP8266)
  Wire.begin(D2, D1); // SDA, SCL
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0,0);
  lcd.print("RFID Attendance");
  lcd.setCursor(0,1);
  lcd.print("Connecting WiFi");

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    lcd.clear();
    lcd.setCursor(0,0);
    lcd.print("WiFi connected");
    lcd.setCursor(0,1);
    lcd.print(WiFi.localIP());
  } else {
    Serial.println("\nWiFi failed");
    lcd.clear();
    lcd.setCursor(0,0);
    lcd.print("WiFi failed");
    lcd.setCursor(0,1);
    lcd.print("Check creds");
  }

  // SPI and RFID init
  SPI.begin();        // SCK, MOSI, MISO default to hardware SPI pins
  mfrc522.PCD_Init(); // Init MFRC522
  delay(100);
  Serial.println("RFID ready");
  lcd.clear();
  lcd.setCursor(0,0);
  lcd.print("RFID ready");
  lcd.setCursor(0,1);
  lcd.print("Tap card");
}

void loop() {
  // Look for new cards
  if ( ! mfrc522.PICC_IsNewCardPresent()) {
    return;
  }
  if ( ! mfrc522.PICC_ReadCardSerial()) {
    return;
  }

  // Got UID
  String uidStr = uidToString(mfrc522.uid);
  Serial.print("Card UID: ");
  Serial.println(uidStr);

  // Show on LCD
  lcd.clear();
  lcd.setCursor(0,0);
  lcd.print("UID:");
  lcd.setCursor(0,1);
  if (uidStr.length() <= 16) {
    lcd.print(uidStr);
  } else {
    lcd.print(uidStr.substring(0,16));
  }

  // Buzz once
  buzz(150);

  // Rate-limit sends
  if (millis() - lastSendMillis < sendInterval) {
    Serial.println("Ignored (debounce)");
    mfrc522.PICC_HaltA(); // stop reading this card
    delay(200);
    return;
  }
  lastSendMillis = millis();

  // Build URL (URL-encode UID)
  String url = String(serverName) + "?studentID=" + urlEncode(uidStr);
  Serial.println("Sending request: " + url);

  // Use HTTPS - setInsecure for simplicity (not for production)
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  if (https.begin(client, url)) {
    int httpCode = https.GET();
    if (httpCode > 0) {
      Serial.printf("Response code: %d\n", httpCode);
      String payload = https.getString();
      Serial.println("Response:");
      Serial.println(payload);
      // show short message on LCD
      lcd.clear();
      lcd.setCursor(0,0);
      lcd.print("Server:");
      lcd.setCursor(0,1);
      if (payload.length() <= 16) lcd.print(payload);
      else lcd.print(payload.substring(0,16));
    } else {
      Serial.printf("Send failed, error: %d\n", httpCode);
      lcd.clear();
      lcd.setCursor(0,0);
      lcd.print("Send failed:");
      lcd.setCursor(0,1);
      lcd.print(String(httpCode));
    }
    https.end();
  } else {
    Serial.println("HTTPS begin failed");
    lcd.clear();
    lcd.setCursor(0,0);
    lcd.print("HTTPS failed");
  }

  // Halt PICC (good practice)
  mfrc522.PICC_HaltA();
  delay(300);
}

// -------- helpers --------
String uidToString(MFRC522::Uid &uid) {
  String s = "";
  for (byte i = 0; i < uid.size; i++) {
    if (uid.uidByte[i] < 0x10) s += "0";
    s += String(uid.uidByte[i], HEX);
    if (i + 1 < uid.size) s += "-";
  }
  s.toUpperCase();
  return s;
}

void buzz(unsigned int ms) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(ms);
  digitalWrite(BUZZER_PIN, LOW);
}

// URL-encode minimal helper
String urlEncode(const String &str) {
  String encoded = "";
  char c;
  const char *p = str.c_str();
  while ((c = *p++)) {
    if ( (c >= '0' && c <= '9') ||
         (c >= 'A' && c <= 'Z') ||
         (c >= 'a' && c <= 'z') ||
         c == '-' || c == '_' || c == '.' || c == '~') {
      encoded += c;
    } else {
      char buf[5];
      snprintf(buf, sizeof(buf), "%%%02X", (unsigned char)c);
      encoded += buf;
    }
  }
  return encoded;
}
