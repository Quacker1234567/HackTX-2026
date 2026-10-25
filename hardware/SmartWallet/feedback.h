#pragma once
#include "config.h"
#include <Arduino.h>

// Seeed Grove Buzzer = passive piezo (resonates around 2300 Hz). It makes sound
// only when SIG carries a square wave, so a plain digitalWrite(HIGH) would just
// click. The ESP32's LEDC hardware generates the tone with no CPU load, and the
// pattern below is a non-blocking state machine.
// Unsigned elapsed-time subtraction remains valid across millis() rollover.
class WalletBuzzer {
 public:
  void begin() {
    if (PIN_BUZZER < 0) return;
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcAttach(PIN_BUZZER, BUZZER_DEFAULT_HZ, 8);
#else
    ledcSetup(CHANNEL, BUZZER_DEFAULT_HZ, 8);
    ledcAttachPin(PIN_BUZZER, CHANNEL);
#endif
    output(false);
  }
  void start(bool enabled, uint32_t onMs, uint32_t offMs,
             uint8_t count, uint16_t frequency, uint32_t now) {
    // A new command replaces the current pattern, including explicit stop.
    output(false);
    active_ = enabled;
    phaseOn_ = enabled;
    onMs_ = onMs;
    offMs_ = offMs;
    remaining_ = count;
    frequency_ = frequency;
    changed_ = now;
    if (active_) output(true);
  }
  void tick(uint32_t now) {
    if (!active_ || uint32_t(now - changed_) < (phaseOn_ ? onMs_ : offMs_)) return;
    changed_ = now;
    if (phaseOn_) {
      output(false);
      phaseOn_ = false;
      if (--remaining_ == 0) active_ = false;
    } else {
      phaseOn_ = true;
      output(true);
    }
  }
 private:
  static constexpr uint8_t CHANNEL = 0;  // LEDC channel (Arduino-ESP32 2.x)
  void output(bool on) {
    if (PIN_BUZZER < 0) return;
    uint32_t hz = on ? frequency_ : 0;  // 0 Hz = silence, pin idles low
    // ledcWriteTone() runs the pin at a 50 % duty square wave on a 10-bit timer (duty 511 = loudest).
    // A narrower pulse at the same frequency is quieter, which is how BUZZER_VOLUME_PERCENT works.
    const uint32_t duty = 511u * BUZZER_VOLUME_PERCENT / 100u;
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWriteTone(PIN_BUZZER, hz);
    if (hz) ledcWrite(PIN_BUZZER, duty);
#else
    ledcWriteTone(CHANNEL, hz);
    if (hz) ledcWrite(CHANNEL, duty);
#endif
  }
  bool active_ = false, phaseOn_ = false;
  uint8_t remaining_ = 0;
  uint16_t frequency_ = BUZZER_DEFAULT_HZ;
  uint32_t onMs_ = 100, offMs_ = 100, changed_ = 0;
};
