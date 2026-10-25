#pragma once
// Budget screen drawing, written as templates over any Adafruit_GFX-like canvas
// (fillRect/drawRect/drawRoundRect/fillRoundRect/fillCircle/drawCircle/setCursor/
// setTextSize/setTextColor/print(const char*)/width()/height()). The firmware
// instantiates it with the ST7735 driver; tests/firmware/render_screens.cpp
// instantiates it with a software canvas so the layout can be checked on a PC
// without hardware.
//
// Everything is placed relative to `top` (the first pixel under the header bar).
#include "wallet_ui.h"
#include <math.h>
#include <stdint.h>
#include <string.h>

namespace screens {

constexpr uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) {
  return uint16_t(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}
constexpr uint16_t BLACK = 0x0000, WHITE = 0xFFFF;
constexpr uint16_t MUTED = rgb(150, 155, 165), TRACK = rgb(38, 40, 48), FRAME = rgb(190, 195, 205);
constexpr uint16_t GREEN = rgb(40, 205, 90), YELLOW = rgb(245, 200, 40), RED = rgb(235, 65, 55);
constexpr uint16_t ORANGE = rgb(255, 140, 20), CYAN = rgb(60, 220, 240);

constexpr int16_t MARGIN = 4;
constexpr int16_t TITLE_Y = 6, BAR_Y = 26, BAR_H = 26, AMOUNT_Y = 58, SUB_Y = 78;
constexpr int16_t HINT_Y = 92, HOLD_Y = 102, HOLD_H = 7, DOTS_Y = 98, BADGE_Y = 94;

// Bar colour from the share of the budget still available.
inline uint16_t levelColor(int32_t left, int32_t total) {
  if (left <= 0 || total <= 0) return RED;
  int64_t pct = int64_t(left) * 100 / total;
  return pct >= 50 ? GREEN : (pct >= 20 ? YELLOW : RED);
}
inline int32_t percentOf(int32_t left, int32_t total) {
  if (left <= 0 || total <= 0) return 0;
  int64_t pct = int64_t(left) * 100 / total;
  return int32_t(pct > 100 ? 100 : pct);
}
// Pixels of a `width`-wide bar that represent `value` out of `total`.
inline int16_t scaled(int32_t value, int32_t total, int16_t width) {
  if (value <= 0 || total <= 0) return 0;
  if (value >= total) return width;
  return int16_t(int64_t(value) * width / total);
}

inline int16_t textWidth(const char *text, uint8_t size) { return int16_t(strlen(text) * 6 * size); }

template <class G>
void drawText(G &g, int16_t x, int16_t y, const char *text, uint8_t size, uint16_t color) {
  g.setTextSize(size);
  g.setTextColor(color);
  g.setCursor(x, y);
  g.print(text);
}
// Left-aligned; large (size 2) when the text fits the row, else small (size 1).
template <class G>
void drawFit(G &g, int16_t y, const char *text, uint16_t color) {
  uint8_t size = textWidth(text, 2) <= g.width() - 2 * MARGIN ? 2 : 1;
  drawText(g, MARGIN, y, text, size, color);
}
template <class G>
void drawCentered(G &g, int16_t y, const char *text, uint8_t size, uint16_t color) {
  drawText(g, int16_t((g.width() - textWidth(text, size)) / 2), y, text, size, color);
}

// Battery-style bar. Filled part = balance after the spend; the orange segment is
// the spend that is about to be taken out of the balance (hidden once paid).
template <class G>
void drawBar(G &g, int16_t y, int32_t left, int32_t total, int32_t spend, bool showSpend) {
  const int16_t nub = 4;
  const int16_t bodyW = int16_t(g.width() - 2 * MARGIN - nub), x = MARGIN;
  g.drawRoundRect(x, y, bodyW, BAR_H, 4, FRAME);
  g.fillRect(int16_t(x + bodyW), int16_t(y + BAR_H / 2 - 6), 3, 12, FRAME);
  const int16_t ix = int16_t(x + 3), iy = int16_t(y + 3), iw = int16_t(bodyW - 6), ih = int16_t(BAR_H - 6);
  g.fillRect(ix, iy, iw, ih, TRACK);

  int32_t after = left - spend;
  int16_t leftPx = scaled(left, total, iw), afterPx = scaled(after, total, iw);
  if (spend > 0 && leftPx > 0 && leftPx - afterPx < 2) afterPx = int16_t(leftPx >= 2 ? leftPx - 2 : 0);
  if (afterPx > 0) g.fillRect(ix, iy, afterPx, ih, levelColor(after, total));
  if (showSpend && spend > 0 && leftPx > afterPx) {
    g.fillRect(int16_t(ix + afterPx), iy, int16_t(leftPx - afterPx), ih, ORANGE);
    if (afterPx > 0) g.fillRect(int16_t(ix + afterPx), iy, 1, ih, BLACK);  // seam between the two segments
  }
}

// "$130.00 left of $200.00", or "OVER $3.20 of $200.00" once the balance is negative.
inline void balanceLine(char *out, size_t size, int32_t left, int32_t total) {
  char a[16], b[16];
  formatMoney(b, sizeof(b), total);
  if (left < 0) { formatMoney(a, sizeof(a), -left); snprintf(out, size, "OVER %s of %s", a, b); }
  else { formatMoney(a, sizeof(a), left); snprintf(out, size, "%s left of %s", a, b); }
}

template <class G>
void drawPageDots(G &g, int16_t y, uint8_t page, uint8_t count) {
  if (count < 2) return;
  const int16_t pitch = 12;
  int16_t x = int16_t((g.width() - (count - 1) * pitch) / 2);
  for (uint8_t i = 0; i < count; ++i) {
    if (i == page) g.fillCircle(int16_t(x + i * pitch), y, 3, WHITE);
    else g.drawCircle(int16_t(x + i * pitch), y, 3, MUTED);
  }
}

// A round face: happy = yellow with a smile, sad = pale blue with a frown and a tear. Drawn from circles and
// small squares only, so it works on any Adafruit_GFX-like canvas.
template <class G>
void drawFace(G &g, int16_t cx, int16_t cy, int16_t r, Mood mood) {
  const bool happy = mood == Mood::Happy;
  g.fillCircle(cx, cy, r, happy ? YELLOW : rgb(120, 170, 255));
  const int16_t ex = int16_t(r / 3), ey = int16_t(r / 4), er = int16_t(r / 9 + 1);
  g.fillCircle(int16_t(cx - ex), int16_t(cy - ey), er, BLACK);
  g.fillCircle(int16_t(cx + ex), int16_t(cy - ey), er, BLACK);
  const float mr = r * 0.5f, centerY = cy + (happy ? r * 0.05f : r * 0.6f);
  for (int deg = 20; deg <= 160; deg += 4) {
    const float a = deg * 0.0174533f;
    const int16_t x = int16_t(cx + mr * cosf(a));
    const int16_t y = int16_t(centerY + (happy ? 1 : -1) * mr * sinf(a) * 0.9f);
    g.fillRect(int16_t(x - 1), int16_t(y - 1), 3, 3, BLACK);
  }
  if (!happy) g.fillCircle(int16_t(cx - ex), int16_t(cy - ey + r / 3 + 2), 2, CYAN);  // a tear
}

// Centered text, wrapped at spaces onto at most two rows of the small font.
template <class G>
void drawWrappedCentered(G &g, int16_t y, const char *text, uint16_t color) {
  const size_t cols = size_t((g.width() - 2 * MARGIN) / 6);
  char row[40];
  size_t len = strlen(text), start = 0;
  for (int r = 0; r < 2 && start < len; ++r) {
    size_t end = start + cols;
    if (end >= len) end = len;
    else {
      size_t sp = end;
      while (sp > start && text[sp] != ' ') --sp;
      if (sp > start) end = sp;
    }
    size_t n = end - start;
    if (n >= sizeof(row)) n = sizeof(row) - 1;
    memcpy(row, text + start, n); row[n] = 0;
    drawCentered(g, y, row, 1, color);
    y = int16_t(y + 12);
    start = end;
    while (start < len && text[start] == ' ') ++start;
  }
}

// Full redraw of the area under the header.
template <class G>
void drawScreen(G &g, int16_t top, const ScreenModel &m) {
  g.fillRect(0, top, g.width(), int16_t(g.height() - top), BLACK);
  char buf[48], amount[16], total[16];
  switch (m.kind) {
    case ScreenKind::Text:  // free text: word-wrapped by the display adapter instead
      break;
    case ScreenKind::Unknown:
      drawFit(g, int16_t(top + 14), m.line1, ORANGE);
      drawText(g, MARGIN, int16_t(top + 44), m.line2, 1, MUTED);
      drawText(g, MARGIN, int16_t(top + 60), "Remove the card", 1, MUTED);
      break;
    case ScreenKind::Budget:
      drawFit(g, int16_t(top + TITLE_Y), m.title, WHITE);
      drawBar(g, int16_t(top + BAR_Y), m.left, m.total, 0, false);
      if (m.left < 0) { formatMoney(amount, sizeof(amount), -m.left); snprintf(buf, sizeof(buf), "OVER %s", amount); }
      else formatMoney(buf, sizeof(buf), m.left);
      drawFit(g, int16_t(top + AMOUNT_Y), buf, levelColor(m.left, m.total));
      formatMoney(total, sizeof(total), m.total);
      if (m.left < 0) snprintf(buf, sizeof(buf), "of %s budget", total);
      else snprintf(buf, sizeof(buf), "left of %s (%ld%%)", total, long(percentOf(m.left, m.total)));
      drawText(g, MARGIN, int16_t(top + SUB_Y), buf, 1, MUTED);
      drawPageDots(g, int16_t(top + DOTS_Y), m.page, m.pageCount);
      break;
    case ScreenKind::Preview:
    case ScreenKind::Pending: {
      bool pending = m.kind == ScreenKind::Pending;
      drawFit(g, int16_t(top + TITLE_Y), m.title, WHITE);
      drawBar(g, int16_t(top + BAR_Y), m.left, m.total, m.spend, true);
      formatMoney(amount, sizeof(amount), m.spend);
      snprintf(buf, sizeof(buf), "-%s", amount);
      drawFit(g, int16_t(top + AMOUNT_Y), buf, ORANGE);
      if (pending) {
        // The balance has not changed yet: the app makes the real transaction and then publishes the new budgets.
        balanceLine(buf, sizeof(buf), m.left, m.total);
        drawText(g, MARGIN, int16_t(top + SUB_Y), buf, 1, MUTED);
        g.fillRoundRect(MARGIN, int16_t(top + BADGE_Y), int16_t(g.width() - 2 * MARGIN), 14, 3, CYAN);
        drawCentered(g, int16_t(top + BADGE_Y + 3), "WAITING FOR APP", 1, BLACK);
      } else {
        balanceLine(buf, sizeof(buf), m.left - m.spend, m.total);
        drawText(g, MARGIN, int16_t(top + SUB_Y), buf, 1, WHITE);
        drawCentered(g, int16_t(top + HINT_Y), "HOLD BUTTON TO CONFIRM", 1, MUTED);
        g.drawRect(MARGIN, int16_t(top + HOLD_Y), int16_t(g.width() - 2 * MARGIN), HOLD_H, MUTED);
      }
      break;
    }
    case ScreenKind::Result: {
      drawFace(g, int16_t(g.width() / 2), int16_t(top + 32), 26, m.mood);
      drawWrappedCentered(g, int16_t(top + 66), m.line1, WHITE);
      formatMoney(amount, sizeof(amount), m.spend);
      snprintf(buf, sizeof(buf), "%s  -%s", m.title, amount);
      drawCentered(g, int16_t(top + 98), buf, 1, MUTED);
      break;
    }
  }
}

// Hold-to-confirm progress inside the track drawn by the preview screen.
template <class G>
void drawHoldProgress(G &g, int16_t top, float fraction) {
  const int16_t x = int16_t(MARGIN + 1), y = int16_t(top + HOLD_Y + 1);
  const int16_t w = int16_t(g.width() - 2 * MARGIN - 2), h = int16_t(HOLD_H - 2);
  int16_t fill = fraction <= 0 ? 0 : int16_t(fraction >= 1 ? w : fraction * w);
  if (fill > 0) g.fillRect(x, y, fill, h, CYAN);
  if (fill < w) g.fillRect(int16_t(x + fill), y, int16_t(w - fill), h, BLACK);
}

}  // namespace screens
