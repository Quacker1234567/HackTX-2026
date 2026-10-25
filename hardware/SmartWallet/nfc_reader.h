#pragma once
#include "config.h"
#include "pn532_proto.h"
#include <Arduino.h>
#include <Wire.h>

// Minimal non-blocking PN532 driver over I2C, written against the datasheet instead of a library
// because the common libraries wait in delay() loops, which would stall the Firebase stream handling
// in loop(). Only connect() (start-up and reconnects, at most every 5 s while the reader is missing)
// waits, for a few hundred milliseconds. The frame handling lives in pn532_proto.h and is unit-tested.
//
// Every NFC_POLL_MS it sends InListPassiveTarget (type A, 106 kbps) and reads the answer without
// blocking; CardTracker turns the stream of "found / not found" into detect and remove events.
class NfcReader {
 public:
  void begin() {
    if (!ENABLE_NFC_READER) return;
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setTimeOut(50);  // the PN532 stretches the I2C clock while it is busy
    if (PIN_PN532_RST >= 0) { pinMode(PIN_PN532_RST, OUTPUT); digitalWrite(PIN_PN532_RST, HIGH); }
    connect();
  }

  // Call every loop().
  void tick(uint32_t now) {
    if (!ENABLE_NFC_READER) return;
    if (!online_) {
      if (uint32_t(now - lastTry_) >= 5000) { lastTry_ = now; connect(); }
      return;
    }
    switch (state_) {
      case State::Idle: {
        if (uint32_t(now - lastPoll_) < NFC_POLL_MS) return;
        lastPoll_ = now;
        const uint8_t inList[] = {pn532::CMD_IN_LIST_PASSIVE, 0x01, 0x00};  // 1 target, 106 kbps type A
        if (!sendFrame(inList, sizeof(inList))) { fail(now); return; }
        state_ = State::WaitAck; stateAt_ = lastIo_ = now;
        break;
      }
      case State::WaitAck: {
        if (uint32_t(now - lastIo_) < 4) return;
        lastIo_ = now;
        uint8_t buf[pn532::ACK_LENGTH];
        int ready = readReply(buf, sizeof(buf));
        if (ready < 0) { fail(now); return; }
        if (ready == 1) {
          if (pn532::isAck(buf, sizeof(buf))) { state_ = State::WaitResp; stateAt_ = now; }
          else fail(now);
        } else if (uint32_t(now - stateAt_) > 100) fail(now);
        break;
      }
      case State::WaitResp: {
        if (uint32_t(now - lastIo_) < 4) return;
        lastIo_ = now;
        uint8_t buf[32];
        int ready = readReply(buf, sizeof(buf));
        if (ready < 0) { fail(now); return; }
        if (ready == 1) { handleAnswer(buf, sizeof(buf), now); }
        else if (uint32_t(now - stateAt_) > NFC_RESPONSE_TIMEOUT_MS) {
          static const uint8_t cancel[pn532::ACK_LENGTH] = {0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00};  // tell it to stop
          Wire.beginTransmission(NFC_I2C_ADDRESS); Wire.write(cancel, sizeof(cancel)); Wire.endTransmission();
          report(false, nullptr, 0, now);
        }
        break;
      }
    }
  }

  // True once for each newly presented card (also when swapping straight to another card);
  // copies its UID as hex into `uid` (needs 2 * 10 + 1 bytes).
  bool takeCard(char *uid) {
    if (!cardPending_) return false;
    cardPending_ = false; strcpy(uid, pendingUid_); return true;
  }
  // True once after a card that was on the reader has gone away.
  bool takeRemoved() { bool r = removed_; removed_ = false; return r; }
  bool online() const { return online_; }
  void toggleDebug() {
    debug_ = !debug_;
    Serial.printf("NFC debug %s\n", debug_ ? "ON (send 'c' again to stop)" : "OFF");
  }

 private:
  enum class State : uint8_t { Idle, WaitAck, WaitResp };
  bool sendFrame(const uint8_t *data, size_t len) {
    uint8_t frame[24];
    size_t n = pn532::buildFrame(frame, data, len);
    Wire.beginTransmission(NFC_I2C_ADDRESS);
    Wire.write(frame, n);
    return Wire.endTransmission() == 0;
  }
  // Reads the PN532's status byte plus n bytes. Returns -1 on an I2C error, 0 if it is not ready, 1 if ready
  // (and buf then holds the n bytes that follow the status byte).
  int readReply(uint8_t *buf, size_t n) {
    size_t got = Wire.requestFrom(NFC_I2C_ADDRESS, uint8_t(n + 1));
    if (got != n + 1) { while (Wire.available()) Wire.read(); return -1; }
    uint8_t status = Wire.read();
    for (size_t i = 0; i < n; ++i) buf[i] = Wire.read();
    return (status & 0x01) ? 1 : 0;
  }
  // Blocking command/response exchange, used only while connecting.
  bool command(const uint8_t *data, size_t len, uint8_t *resp, size_t respLen, uint32_t timeoutMs) {
    bool sent = false;
    for (uint8_t attempt = 0; attempt < 3 && !sent; ++attempt) {  // the first write can be NACKed while it wakes up
      sent = sendFrame(data, len);
      if (!sent) delay(10);
    }
    if (!sent) return false;
    uint32_t start = millis();
    uint8_t ack[pn532::ACK_LENGTH];
    for (;;) {
      int r = readReply(ack, sizeof(ack));
      if (r < 0) return false;
      if (r == 1) break;
      if (millis() - start > timeoutMs) return false;
      delay(2);
    }
    if (!pn532::isAck(ack, sizeof(ack))) return false;
    for (;;) {
      int r = readReply(resp, respLen);
      if (r < 0) return false;
      if (r == 1) return true;
      if (millis() - start > timeoutMs) return false;
      delay(2);
    }
  }
  bool exchange(const uint8_t *data, size_t len, uint8_t cmd, const uint8_t *&payload, size_t &payloadLen, uint8_t *resp, size_t respLen) {
    return command(data, len, resp, respLen, 300) && pn532::parseResponse(resp, respLen, cmd, payload, payloadLen);
  }
  void connect() {
    online_ = false; state_ = State::Idle; failures_ = 0;
    if (PIN_PN532_RST >= 0) { digitalWrite(PIN_PN532_RST, LOW); delay(5); digitalWrite(PIN_PN532_RST, HIGH); delay(30); }
    uint8_t resp[24];
    const uint8_t *payload = nullptr; size_t plen = 0;
    const uint8_t firmware[] = {pn532::CMD_GET_FIRMWARE};
    bool ok = exchange(firmware, sizeof(firmware), pn532::CMD_GET_FIRMWARE, payload, plen, resp, sizeof(resp)) && plen >= 4;
    if (ok) Serial.printf("PN532 found (chip PN5%02X, firmware %u.%u)\n", payload[0], unsigned(payload[1]), unsigned(payload[2]));
    const uint8_t sam[] = {pn532::CMD_SAM_CONFIG, 0x01, 0x14, 0x01};  // normal mode, 1 s timeout, no IRQ
    if (ok) ok = exchange(sam, sizeof(sam), pn532::CMD_SAM_CONFIG, payload, plen, resp, sizeof(resp));
    const uint8_t retries[] = {pn532::CMD_RF_CONFIG, 0x05, 0xFF, 0x01, NFC_ACTIVATION_RETRIES};  // MxRtyPassiveActivation
    if (ok) ok = exchange(retries, sizeof(retries), pn532::CMD_RF_CONFIG, payload, plen, resp, sizeof(resp));
    if (ok) { Serial.println("NFC reader ready: hold a card against the module"); warned_ = false; }
    else if (!warned_) {
      warned_ = true;
      Serial.printf("PN532 not answering at 0x%02X. Check: the module's switches are set to I2C, SDA->GPIO%d, SCL->GPIO%d, VCC and GND. Retrying...\n",
                    NFC_I2C_ADDRESS, PIN_I2C_SDA, PIN_I2C_SCL);
    }
    online_ = ok;
    lastTry_ = millis();
    tracker_.reset();
  }
  void handleAnswer(const uint8_t *buf, size_t n, uint32_t now) {
    const uint8_t *payload = nullptr; size_t plen = 0;
    uint8_t uid[pn532::MAX_UID], uidLen = 0;
    if (!pn532::parseResponse(buf, n, pn532::CMD_IN_LIST_PASSIVE, payload, plen)) { fail(now); return; }
    int found = pn532::parseInList(payload, plen, uid, uidLen);
    if (found < 0) { fail(now); return; }
    failures_ = 0;
    report(found == 1, uid, uidLen, now);
  }
  void report(bool found, const uint8_t *uid, uint8_t uidLen, uint32_t now) {
    char hex[2 * pn532::MAX_UID + 1] = "";
    if (found) pn532::hexUid(hex, uid, uidLen);
    if (debug_) Serial.printf("NFC poll: %s%s\n", found ? "card " : "no card", hex);
    switch (tracker_.poll(found, hex)) {
      case pn532::CardTracker::Detected: strcpy(pendingUid_, hex); cardPending_ = true; break;
      case pn532::CardTracker::Removed: removed_ = true; break;
      case pn532::CardTracker::None: break;
    }
    state_ = State::Idle; lastPoll_ = now;
  }
  void fail(uint32_t now) {
    state_ = State::Idle; lastPoll_ = now;
    if (++failures_ >= 5) {
      Serial.println("PN532 read failures; will reconnect");
      online_ = false; lastTry_ = now;
      // Losing the reader counts as the card leaving, so a preview can never get stuck.
      if (tracker_.present()) removed_ = true;
      tracker_.reset(); failures_ = 0;
    }
  }

  pn532::CardTracker tracker_;
  State state_ = State::Idle;
  bool online_ = false, debug_ = false, warned_ = false, cardPending_ = false, removed_ = false;
  uint8_t failures_ = 0;
  uint32_t lastTry_ = 0, lastPoll_ = 0, lastIo_ = 0, stateAt_ = 0;
  char pendingUid_[2 * pn532::MAX_UID + 1] = "";
};
