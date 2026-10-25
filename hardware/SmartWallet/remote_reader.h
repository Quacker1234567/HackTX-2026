#pragma once
// Pure C++ (no Arduino dependencies, unit-testable on a PC): turns the card messages that the laptop
// bridge writes to wallets/<id>/control/desired/reader into "card detected" / "card removed" events.
//
// Message: {seq, present, uid}. The bridge writes one when a card appears, one when it is taken away,
// and repeats the "present" message every ~2 s as a heartbeat while the card stays on the reader. If the
// heartbeats stop (bridge closed, cable pulled, laptop asleep) the card is treated as removed after
// REMOTE_READER_TIMEOUT_MS, so a preview can never get stuck on screen.
#include "config.h"
#include <stdint.h>
#include <string.h>

class RemoteReader {
 public:
  enum Event : uint8_t { None, Detected, Removed };

  // One message from the database. `seq` must increase with every message the bridge sends.
  Event onMessage(uint64_t seq, bool present, const char *uid, uint32_t now) {
    if (seq <= lastSeq_) return None;  // old, duplicate or out of order
    lastSeq_ = seq;
    return apply(present, uid, now);
  }
  // The reader node was deleted or is not an object: no card.
  Event onCleared(uint32_t now) { return apply(false, "", now); }
  // Call every loop().
  Event tick(uint32_t now) {
    if (present_ && uint32_t(now - seenAt_) > REMOTE_READER_TIMEOUT_MS) { present_ = false; return Removed; }
    return None;
  }
  bool present() const { return present_; }
  const char *uid() const { return uid_; }

 private:
  Event apply(bool present, const char *uid, uint32_t now) {
    if (!present) {
      bool was = present_;
      present_ = false;
      return was ? Removed : None;
    }
    seenAt_ = now;
    if (present_ && strcmp(uid_, uid) == 0) return None;  // heartbeat for the card that is already here
    strncpy(uid_, uid, sizeof(uid_) - 1); uid_[sizeof(uid_) - 1] = 0;
    present_ = true;
    return Detected;  // new card, or a straight swap to another one
  }

  bool present_ = false;
  uint64_t lastSeq_ = 0;
  uint32_t seenAt_ = 0;
  char uid_[33] = "";
};
