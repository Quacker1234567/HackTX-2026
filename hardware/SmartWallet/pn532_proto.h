#pragma once
// Pure C++ PN532 frame handling and card tracking (no Arduino dependencies, unit-testable on a PC).
// Frame layout (datasheet section 6.2): 00 00 FF LEN LCS TFI DATA... DCS 00, where LEN counts TFI+DATA,
// LCS = ~LEN+1, DCS = ~(TFI+DATA sum)+1. Host -> PN532 uses TFI D4, PN532 -> host uses D5.
#include "config.h"
#include <stdint.h>
#include <stddef.h>
#include <string.h>

namespace pn532 {

constexpr uint8_t CMD_GET_FIRMWARE = 0x02, CMD_RF_CONFIG = 0x32, CMD_SAM_CONFIG = 0x14, CMD_IN_LIST_PASSIVE = 0x4A;
constexpr uint8_t TFI_TO_PN532 = 0xD4, TFI_FROM_PN532 = 0xD5;
constexpr size_t ACK_LENGTH = 6;
constexpr size_t MAX_UID = 10;

// Builds a host frame for `data` (command byte first). `out` needs len + 9 bytes. Returns the frame length.
inline size_t buildFrame(uint8_t *out, const uint8_t *data, size_t len) {
  size_t n = 0;
  out[n++] = 0x00; out[n++] = 0x00; out[n++] = 0xFF;
  uint8_t length = uint8_t(len + 1);  // TFI + data
  out[n++] = length; out[n++] = uint8_t(~length + 1);
  out[n++] = TFI_TO_PN532;
  uint8_t sum = TFI_TO_PN532;
  for (size_t i = 0; i < len; ++i) { out[n++] = data[i]; sum = uint8_t(sum + data[i]); }
  out[n++] = uint8_t(~sum + 1);
  out[n++] = 0x00;
  return n;
}

// The 6-byte ACK the PN532 sends after accepting a command: 00 00 FF 00 FF 00.
inline bool isAck(const uint8_t *buf, size_t n) {
  static const uint8_t ack[ACK_LENGTH] = {0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00};
  return n >= ACK_LENGTH && memcmp(buf, ack, ACK_LENGTH) == 0;
}

// Validates a response frame to command `cmd` and exposes its payload (the bytes after the command
// echo). Returns false for a bad preamble, length or checksum, or a response to a different command.
inline bool parseResponse(const uint8_t *buf, size_t n, uint8_t cmd, const uint8_t *&payload, size_t &payloadLen) {
  if (n < 9 || buf[0] != 0x00 || buf[1] != 0x00 || buf[2] != 0xFF) return false;
  uint8_t length = buf[3];
  if (uint8_t(length + buf[4]) != 0 || length < 2) return false;  // LEN + LCS must be 0
  if (size_t(length) + 7 > n) return false;                       // whole frame must be present
  if (buf[5] != TFI_FROM_PN532 || buf[6] != uint8_t(cmd + 1)) return false;
  uint8_t sum = 0;
  for (size_t i = 0; i < length; ++i) sum = uint8_t(sum + buf[5 + i]);
  if (uint8_t(sum + buf[5 + length]) != 0) return false;  // data checksum
  payload = buf + 7; payloadLen = length - 2;
  return true;
}

// InListPassiveTarget (106 kbps type A) response payload: NbTg Tg SENS_RES(2) SEL_RES NFCIDLength NFCID...
// Returns the number of targets found (0 or 1) and copies the first UID.
inline int parseInList(const uint8_t *payload, size_t len, uint8_t *uid, uint8_t &uidLen) {
  uidLen = 0;
  if (len < 1) return -1;
  if (payload[0] == 0) return 0;
  if (len < 6 || payload[5] == 0 || payload[5] > MAX_UID || len < size_t(6 + payload[5])) return -1;
  uidLen = payload[5];
  memcpy(uid, payload + 6, uidLen);
  return 1;
}

// Uppercase hex, no separators: 04A1B2C3 (4-byte UID) or 04A1B2C3D4E5F6 (7-byte). `out` needs 2*len+1 bytes.
inline void hexUid(char *out, const uint8_t *uid, size_t len) {
  static const char digits[] = "0123456789ABCDEF";
  for (size_t i = 0; i < len; ++i) { out[2 * i] = digits[uid[i] >> 4]; out[2 * i + 1] = digits[uid[i] & 15]; }
  out[2 * len] = 0;
}

// Turns a stream of poll results (card found with this UID / nothing found) into one "card detected"
// event per card and one "card removed" event once the card has stayed away for NFC_REMOVE_POLLS polls.
class CardTracker {
 public:
  enum Event : uint8_t { None, Detected, Removed };
  Event poll(bool found, const char *uid) {
    if (found) {
      misses_ = 0;
      if (present_ && strcmp(uid, uid_) == 0) return None;
      strncpy(uid_, uid, sizeof(uid_) - 1); uid_[sizeof(uid_) - 1] = 0;
      present_ = true;
      return Detected;  // first sighting, or straight swap to another card
    }
    if (present_ && ++misses_ >= NFC_REMOVE_POLLS) { present_ = false; misses_ = 0; return Removed; }
    return None;
  }
  void reset() { present_ = false; misses_ = 0; }
  bool present() const { return present_; }
  const char *uid() const { return uid_; }
 private:
  bool present_ = false;
  uint8_t misses_ = 0;
  char uid_[2 * MAX_UID + 1] = "";
};

}  // namespace pn532
