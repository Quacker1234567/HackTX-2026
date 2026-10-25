#pragma once
// Deliberately free of Arduino headers so the PN532 frame handling in
// pn532_proto.h can be unit-tested on a normal computer.
#include <stdint.h>
#include <stddef.h>

// ---------------------------------------------------------------------------
// TARGET HARDWARE
//   MCU      : ESP32-WROOM-32 (classic ESP32, no PSRAM, so GPIO16/17 are free)
//   Display  : 1.8" 128x160 SPI TFT, ST7735 (write-only SPI)
//   Tag input: PN532 NFC/RFID reader module (V3), I2C mode
//   Buzzer   : Seeed Grove Buzzer (passive piezo, SIG pin)
//   Button   : Seeed Grove Button (SIG is HIGH while pressed)
// ---------------------------------------------------------------------------

// 0 = Serial only (no TFT), 1 = ST7735S TFT.
#ifndef WALLET_DISPLAY_DRIVER
#define WALLET_DISPLAY_DRIVER 1
#endif

// ---- TFT (display pin label -> ESP32 GPIO), hardware VSPI -----------------------
//   TFT CLK -> GPIO18   TFT DIN -> GPIO23   TFT CS  -> GPIO25
//   TFT D/C -> GPIO26   TFT RST -> GPIO27
//   TFT VCC -> 3V3      TFT GND -> GND
//   TFT BL  -> 3V3 (always on; a ~1 kOhm series resistor is fine)  or a GPIO set in PIN_TFT_BL below
constexpr int PIN_TFT_SCLK = 18;
constexpr int PIN_TFT_MOSI = 23;
constexpr int PIN_TFT_CS   = 25;
constexpr int PIN_TFT_DC   = 26;
constexpr int PIN_TFT_RST  = 27;
// -1 = backlight wired straight to 3V3. Use a GPIO (for example 4) only if
// you want software control; the panel's backlight is rated ~60 mA, so only do
// that if your module drives BL through a transistor.
constexpr int PIN_TFT_BL   = -1;
// 1 = landscape 160x128 (default, fits more text), 0/2 = portrait 128x160.
constexpr uint8_t TFT_ROTATION = 1;
// Adafruit_ST7735 init variant. BLACKTAB is the usual match for ST7735S 1.8"
// modules. If the picture is shifted by a few pixels or shows noise on one edge,
// try INITR_GREENTAB; if red and blue are swapped, try INITR_REDTAB.
#define TFT_INIT_TAB INITR_BLACKTAB
// Flash the screen red, green, blue, white for about a second at power-up. A blank screen then
// means wiring or backlight; wrong colours mean TFT_INIT_TAB / TFT_INVERT_COLORS below.
constexpr bool TFT_BOOT_TEST = true;
// Set true if all colours look inverted (black <-> white).
constexpr bool TFT_INVERT_COLORS = false;
// The Adafruit driver defaults to 32 MHz, above the ST7735S's ~15 MHz write
// limit and unreliable over jumper wires. 10 MHz is plenty for text.
constexpr uint32_t TFT_SPI_HZ = 10000000;

// ---- PN532 NFC reader (I2C) ---------------------------------------------------
// Set the module's interface switches to I2C (see the table printed on the board; usually
// switch 1 ON, switch 2 OFF), then wire VCC -> 3V3 (use 3V3, not 5V: the board's I2C lines may be
// pulled up to its supply, and ESP32 pins are not 5 V tolerant), GND -> GND, SDA -> GPIO21, SCL -> GPIO22.
// IRQ is not used.
constexpr int PIN_I2C_SDA = 21;
constexpr int PIN_I2C_SCL = 22;
// Optional: PN532 RSTO/RSTPDN pin -> a GPIO for a hardware reset at start-up. -1 = not wired.
constexpr int PIN_PN532_RST = -1;

// ---- Grove modules ----------------------------------------------------------
// Wire each Grove cable's yellow SIG wire to the GPIO below, red -> 3V3 and
// black -> GND. Power both modules from 3V3, NOT 5 V, so SIG stays at 3.3 V.
constexpr int PIN_BUZZER = 33;  // Grove Buzzer SIG (-1 disables)
constexpr int PIN_BUTTON = 32;  // Grove Button SIG (-1 disables)
// Grove Button is HIGH when pressed and has its own pull-down resistor.
constexpr bool BUTTON_ACTIVE_LOW = false;
// Grove Buzzer is a passive piezo: it only sounds when driven with a square
// wave. A steady HIGH just clicks, so the firmware always uses LEDC tones.
constexpr uint16_t BUZZER_DEFAULT_HZ = 2300;
// Loudness, 1-100 (100 = the piezo's full-strength tone, which is very loud up close). Lower it
// if it is too loud; raise it if you cannot hear it in a noisy room.
constexpr uint8_t BUZZER_VOLUME_PERCENT = 15;
// Minimum gap between "card detected" beeps, so a flickering sensor cannot machine-gun the buzzer.
constexpr uint32_t BEEP_DETECT_MIN_GAP_MS = 1500;

// ---- Timing -----------------------------------------------------------------
constexpr uint32_t BUTTON_DEBOUNCE_MS = 35;
constexpr uint32_t BUTTON_LONG_PRESS_MS = 900;
// After a preview or payment screen ends, short presses do not switch budgets for this long.
constexpr uint32_t BUTTON_CYCLE_LOCKOUT_MS = 600;
constexpr uint32_t WIFI_RETRY_MS = 10000;
constexpr uint32_t FIREBASE_RETRY_MS = 3000;
constexpr uint32_t STATUS_INTERVAL_MS = 15000;
constexpr uint32_t EVENT_MAX_AGE_MS = 30000;
// Confirmed purchases are retried for longer than other events (see PendingEvent::durable).
constexpr uint32_t PURCHASE_MAX_AGE_MS = 300000;
constexpr uint8_t PURCHASE_MAX_ATTEMPTS = 10;
constexpr size_t MAX_MESSAGE_BYTES = 4096;  // budget snapshots are ~1.5 KB


// ---- Budget screens and purchase flow ---------------------------------------
// Holding the button (BUTTON_LONG_PRESS_MS above) while a card is previewed confirms
// the purchase. Keep these in step with the limits in functions/protocol.cjs.
constexpr uint8_t MAX_CATEGORIES = 8;
constexpr uint8_t MAX_CARDS = 8;
// After a confirmed purchase the wallet waits for the app (which makes the real transaction, recalculates
// the budgets and judges the purchase). If no answer arrives within this time it gives up and shows the
// budgets as the app last published them.
constexpr uint32_t TX_REPLY_TIMEOUT_MS = 20000;
constexpr uint32_t RESULT_SCREEN_MS = 3000;  // how long the happy / sad face stays up
// Beep patterns: card detected, purchase confirmed, unknown card.
constexpr uint32_t BEEP_DETECT_ON_MS = 90;
constexpr uint32_t BEEP_CONFIRM_ON_MS = 80, BEEP_CONFIRM_OFF_MS = 70;
constexpr uint8_t BEEP_CONFIRM_COUNT = 2;
constexpr uint32_t BEEP_ERROR_ON_MS = 300;
constexpr uint16_t BEEP_ERROR_HZ = 1200;

// ---- NFC reader --------------------------------------------------------------
// Where card taps come from. You can enable either or both.
//  - Remote reader: a USB NFC reader plugged into a laptop; tools/nfc_bridge.py there relays taps through
//    the database (control/desired/reader) and this firmware reacts to them. No wiring on the ESP32.
//  - Local reader: a PN532 module wired to this board over I2C (see pins above).
constexpr bool ENABLE_REMOTE_READER = true;
// If the bridge's heartbeat (sent every ~2 s while a card is on the reader) stops for this long, the
// card counts as removed, so a preview cannot get stuck if the bridge is closed or the laptop sleeps.
constexpr uint32_t REMOTE_READER_TIMEOUT_MS = 6000;
// Off by default: with no PN532 wired, its start-up retries would only waste time and print warnings.
constexpr bool ENABLE_NFC_READER = false;
constexpr uint8_t NFC_I2C_ADDRESS = 0x24;       // PN532 default 7-bit address
constexpr uint32_t NFC_POLL_MS = 120;           // how often to look for a card
constexpr uint8_t NFC_REMOVE_POLLS = 3;         // empty polls in a row = card taken away (~0.4 s)
constexpr uint32_t NFC_RESPONSE_TIMEOUT_MS = 300;
// How many times the PN532 retries finding a card per poll (0xFF = wait forever, which would block
// removal detection). Each retry takes roughly 10-30 ms.
constexpr uint8_t NFC_ACTIVATION_RETRIES = 0x01;
// A card's tag UID is its hex serial number (for example 04A1B2C3 or 04A1B2C3D4E5F6). Tap each of
// your cards with the serial monitor open: it prints "NFC card detected: <UID>". Put those UIDs in the
// budget's card table.
//
// Serial 'n' presents the next simulated card below, 'x' removes it, 'b' is a short press and
// 'h' a hold: handy for trying the whole purchase flow without a reader or button. Put these
// UIDs in the card table to use them (they are reported as simulated purchases).
constexpr bool ENABLE_SIMULATED_NFC = true;
constexpr const char *SIM_CARD_UIDS[] = {"DEMO-01", "DEMO-02", "DEMO-03"};
constexpr size_t SIM_CARD_COUNT = sizeof(SIM_CARD_UIDS) / sizeof(SIM_CARD_UIDS[0]);
