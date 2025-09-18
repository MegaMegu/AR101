#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <ESP8266HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LCDI2C_Generic.h>

// 📌 CONFIGURATION - EDIT THESE
const char* ssid = "GFiber_2.4_Coverage_6595C";
const char* password = "BE574178";

const char* serverName = "https://script.google.com/macros/s/AKfycbwj7wnx5Jga_-GEs8XPX7dhl8MXrPjyKNtXXe9zm5NyqCqJjJRqepPkIMkotf3ZUm8/exec";

// =========================================================================
// Pin definitions (use NodeMCU D# labels)
#define RST_PIN D4
#define SS_PIN D8

// Objects
MFRC522 mfrc522(SS_PIN, RST_PIN);
LCDI2C_Generic lcd(0x27, 16, 2); // Adjust 0x27 to 0x3F if needed

// =========================================================================

void setup() {
  Serial.begin(9600);
  delay(10);

  // LCD setup
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Booting...");

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  lcd.setCursor(0, 1);
  lcd.print("WiFi Connecting");

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connected");

  // SPI and RFID init
  SPI.begin();
  mfrc522.PCD_Init();
  delay(100);
  Serial.println("RFID ready. Tap card.");
  lcd.setCursor(0, 1);
  lcd.print("RFID Ready...");
}

void loop() {
  if ( ! mfrc522.PICC_IsNewCardPresent() || ! mfrc522.PICC_ReadCardSerial()) {
    return;
  }
  
  String uidStr = uidToString(mfrc522.uid);
  Serial.print("Card UID: ");
  Serial.println(uidStr);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Card UID:");
  lcd.setCursor(0, 1);
  lcd.print(uidStr);

  // Build URL
  String url = String(serverName) + "?cardUID=" + urlEncode(uidStr);
  Serial.println("Sending request: " + url);

  // Use HTTPS - setInsecure for simplicity
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient https;
  if (https.begin(client, url)) {
    https.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    https.setTimeout(10000); 
    
    int httpCode = https.GET();
    
    if (httpCode > 0) {
      String payload = https.getString();
      Serial.print("Response: ");
      Serial.println(payload);

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Server Reply:");
      lcd.setCursor(0, 1);
      lcd.print(payload.substring(0,16)); // Only first 16 chars fit
    } else {
      Serial.print("HTTP GET failed, error: ");
      Serial.println(https.errorToString(httpCode));

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("HTTP Error");
      lcd.setCursor(0, 1);
      lcd.print(https.errorToString(httpCode));
    }
    https.end();
  }
  
  mfrc522.PICC_HaltA();
  delay(1500);
}

// -------- Helper Functions --------
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
