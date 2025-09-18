#include <SPI.h>
#include <MFRC522.h>

// RFID Reader Pin Definitions
#define RST_PIN D2  // Configurable, D2 or D4 on some models
#define SS_PIN D8   // Configurable, D8 or D0 on some models

MFRC522 rfid(SS_PIN, RST_PIN); // Create MFRC522 instance

void setup() {
  Serial.begin(9600);
  SPI.begin();      // Init SPI bus
  rfid.PCD_Init();  // Init MFRC522
  
  Serial.println("Place your RFID tag near the reader...");
}

void loop() {
  // Look for new cards
  if ( ! rfid.PICC_IsNewCardPresent()) {
    return;
  }
  
  // Select one of the cards
  if ( ! rfid.PICC_ReadCardSerial()) {
    return;
  }
  
  // Display the UID
  Serial.print("Card UID:");
  
  String uidString = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    uidString += (rfid.uid.uidByte[i] < 0x10 ? " 0" : " ");
    uidString += String(rfid.uid.uidByte[i], HEX);
  }
  uidString.toUpperCase();

  Serial.println(uidString);

  // Halt PICC for new scan
  rfid.PICC_HaltA();
  
  delay(1000);
}
