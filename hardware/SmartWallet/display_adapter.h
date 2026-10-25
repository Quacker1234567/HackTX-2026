#pragma once
#include "config.h"
#include "budget_screens.h"
#include <Arduino.h>

#if WALLET_DISPLAY_DRIVER == 1
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#elif WALLET_DISPLAY_DRIVER != 0
#error "Select display driver 0 (serial only) or 1 (ST7735S TFT) in config.h"
#endif

// Layout for the 128x160 MSP1804 (landscape by default):
//   header bar with title + connection dot, then either the budget screens from
//   budget_screens.h (category bar, purchase preview, confirmation) or, before any
//   budget has been published, two lines of text: line1 (large, white) and line2
//   (cyan), word-wrapped and dropping to the small font when a line would not fit
//   one row in the large font.
class WalletDisplay {
 public:
  void begin() {
#if WALLET_DISPLAY_DRIVER == 1
    if (PIN_TFT_BL >= 0) { pinMode(PIN_TFT_BL, OUTPUT); digitalWrite(PIN_TFT_BL, LOW); }
    // Write-only panel: no MISO, no hardware CS (the library toggles CS itself).
    SPI.begin(PIN_TFT_SCLK, -1, PIN_TFT_MOSI, -1);
    tft_.initR(TFT_INIT_TAB);
    tft_.setSPISpeed(TFT_SPI_HZ);  // must come after initR()
    tft_.setRotation(TFT_ROTATION);
    if (TFT_INVERT_COLORS) tft_.invertDisplay(true);
    tft_.setTextWrap(false);
    if (TFT_BOOT_TEST) {  // red, green, blue, white: proves wiring, backlight and colour order at power-up
      const uint16_t colors[] = {ST77XX_RED, ST77XX_GREEN, ST77XX_BLUE, ST77XX_WHITE};
      for (uint16_t c : colors) { tft_.fillScreen(c); delay(300); }
    }
    tft_.fillScreen(ST77XX_BLACK);
    drawHeader();
    if (PIN_TFT_BL >= 0) digitalWrite(PIN_TFT_BL, HIGH);
    ready_ = true;
#else
    ready_ = true;
#endif
  }

  // Small status dot in the header: green when Wi-Fi and Firebase are ready.
  void setOnline(bool online) {
    if (online == online_) return;
    online_ = online;
#if WALLET_DISPLAY_DRIVER == 1
    if (ready_) drawDot();
#endif
  }

  void show(const String &line1, const String &line2) {
    ScreenModel m;
    copyText(m.line1, sizeof(m.line1), line1.c_str());
    copyText(m.line2, sizeof(m.line2), line2.c_str());
    draw(m);
  }

  // Full redraw of whatever the UI state machine wants on screen.
  void draw(const ScreenModel &m) {
    holdPx_ = -1;
    logModel(m);
    if (!ready_) return;
#if WALLET_DISPLAY_DRIVER == 1
    if (m.kind == ScreenKind::Text) {
      tft_.fillRect(0, HEADER_H, tft_.width(), tft_.height() - HEADER_H, ST77XX_BLACK);
      int16_t y = HEADER_H + 10;
      y = drawWrapped(m.line1, y, 2, ST77XX_WHITE);
      drawWrapped(m.line2, y + 8, 2, ST77XX_CYAN);
    } else {
      screens::drawScreen(tft_, HEADER_H, m);
    }
#endif
  }

  // Hold-to-confirm progress (0..1) on the preview screen; only touches the display
  // when the filled width actually changes.
  void drawHold(float fraction) {
#if WALLET_DISPLAY_DRIVER == 1
    if (!ready_) return;
    int16_t px = fraction <= 0 ? 0 : int16_t(fraction * 100);
    if (px == holdPx_) return;
    holdPx_ = px;
    screens::drawHoldProgress(tft_, HEADER_H, fraction);
#endif
  }

 private:
#if WALLET_DISPLAY_DRIVER == 1
  static constexpr int16_t HEADER_H = 18;
  static constexpr int16_t MARGIN = 4;

  void drawHeader() {
    tft_.fillRect(0, 0, tft_.width(), HEADER_H, tft_.color565(0, 40, 90));
    tft_.setTextSize(1);
    tft_.setTextColor(ST77XX_WHITE);
    tft_.setCursor(MARGIN, 5);
    tft_.print("SMART WALLET");
    drawDot();
  }
  void drawDot() {
    tft_.fillCircle(tft_.width() - 10, HEADER_H / 2, 4,
                    online_ ? ST77XX_GREEN : tft_.color565(255, 140, 0));
  }

  // Draws text at row y, returns the y position below it. Uses the large font
  // when the text fits on one row, otherwise the small font on up to 2 rows.
  int16_t drawWrapped(const String &text, int16_t y, uint8_t maxRows, uint16_t color) {
    if (text.length() == 0) return y;
    int16_t usable = tft_.width() - 2 * MARGIN;
    uint8_t size = (text.length() <= size_t(usable / 12)) ? 2 : 1;
    size_t cols = usable / (6 * size);
    tft_.setTextSize(size);
    tft_.setTextColor(color);
    size_t pos = 0;
    uint8_t row = 0;
    while (pos < text.length() && row < maxRows) {
      size_t end = pos + cols;
      if (end >= text.length()) end = text.length();
      else {
        int sp = text.lastIndexOf(' ', end);  // break at the last space that fits
        if (sp > int(pos)) end = sp;
      }
      String piece = text.substring(pos, end);
      piece.trim();
      tft_.setCursor(MARGIN, y);
      tft_.print(piece);
      y += 8 * size + 2;
      pos = end;
      while (pos < text.length() && text[pos] == ' ') ++pos;
      ++row;
    }
    return y;
  }
#endif

  void logModel(const ScreenModel &m) {
    char left[16], total[16], spend[16];
    formatMoney(left, sizeof(left), m.left); formatMoney(total, sizeof(total), m.total); formatMoney(spend, sizeof(spend), m.spend);
    switch (m.kind) {
      case ScreenKind::Text:
      case ScreenKind::Unknown: Serial.printf("[display] %s | %s\n", m.line1, m.line2); break;
      case ScreenKind::Budget: Serial.printf("[display] budget %s: %s of %s left (%u/%u)\n", m.title, left, total, unsigned(m.page + 1), unsigned(m.pageCount)); break;
      case ScreenKind::Preview: Serial.printf("[display] preview %s: -%s from %s of %s, hold button to confirm\n", m.title, spend, left, total); break;
      case ScreenKind::Pending: Serial.printf("[display] pending %s: -%s sent to the app, waiting for its answer (balance %s of %s)\n", m.title, spend, left, total); break;
      case ScreenKind::Result: Serial.printf("[display] result %s: %s face, \"%s\" (-%s)\n", m.title, m.mood == Mood::Happy ? "happy" : "sad", m.line1, spend); break;
    }
  }

  bool ready_ = false;
  bool online_ = false;
  int16_t holdPx_ = -1;
#if WALLET_DISPLAY_DRIVER == 1
  Adafruit_ST7735 tft_{&SPI, PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST};
#endif
};
