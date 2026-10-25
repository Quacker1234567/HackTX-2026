#pragma once
// Pure C++ wallet interaction logic (no Arduino dependencies, unit-testable on a PC).
//
//   idle    : shows one budget category; a short button press cycles to the next
//   tap     : a known card -> preview (bar with the pending spend), detect beep
//   hold    : holding the button for BUTTON_LONG_PRESS_MS confirms -> confirm beep and a purchase
//             request for the app. The wallet does NOT change any balance itself.
//   pending : "waiting for the app" while the app makes the real transaction, recalculates the
//             budgets and judges the purchase (up to TX_REPLY_TIMEOUT_MS)
//   result  : the app's reply arrives with the new budgets and a verdict: a happy or sad face is
//             shown for RESULT_SCREEN_MS, then the idle screen with the new numbers
//   leave   : card removed before confirming -> straight back to the idle screen
//
// The app is the only thing that moves money and balances; the wallet only reports what the user
// confirmed and shows what the app answers.
#include "config.h"
#include <stdint.h>
#include <stdio.h>
#include <string.h>

struct BudgetCategory { char id[13]; char name[13]; int32_t left, total; };  // cents
struct CardRule { char uid[33]; char category[13]; int32_t amount; };          // cents
struct BudgetData {
  BudgetCategory categories[MAX_CATEGORIES];
  CardRule cards[MAX_CARDS];
  uint8_t categoryCount = 0, cardCount = 0;
};

enum class ScreenKind : uint8_t { Text, Budget, Preview, Unknown, Pending, Result };
enum class Beep : uint8_t { None, Detect, Confirm, Error };
enum class Mood : uint8_t { Happy, Sad };

struct PurchaseRequest { char uid[33]; char category[13]; int32_t amount; };

// Everything the renderer needs. `spend` is the pending/just-made amount (0 on the idle screen);
// `left` is the balance before the spend, so the bar can show the remaining part and the part about
// to be removed as two segments. On the Result screen `line1` holds the app's short message.
struct ScreenModel {
  ScreenKind kind = ScreenKind::Text;
  char title[13] = "";
  char line1[33] = "", line2[33] = "";   // Text / Unknown screens; Result: line1 = message
  int32_t left = 0, total = 0, spend = 0;
  Mood mood = Mood::Happy;
  uint8_t page = 0, pageCount = 0;
  uint32_t revision = 0;                  // bumps whenever the picture must be redrawn
};

// "$142.50", "-$3.20". buf needs room for sign + 8 digits + '.' + 2 digits + NUL.
inline void formatMoney(char *buf, size_t size, int32_t cents) {
  int64_t v = cents;
  const char *sign = v < 0 ? "-" : "";
  if (v < 0) v = -v;
  snprintf(buf, size, "%s$%ld.%02d", sign, long(v / 100), int(v % 100));
}

inline void copyText(char *dst, size_t size, const char *src) {
  strncpy(dst, src ? src : "", size - 1);
  dst[size - 1] = 0;
}

class WalletUi {
 public:
  // ---- data in -----------------------------------------------------------------
  // Authoritative budgets from the app. A snapshot identical to what is already held changes nothing,
  // so the screen is not redrawn.
  void setBudget(const BudgetData &data) {
    if (hasBudget_ && sameBudget(data_, data)) return;
    data_ = data; hasBudget_ = data.categoryCount > 0;
    if (page_ >= data_.categoryCount) page_ = 0;
    if (state_ == State::Preview && !resolvePreview()) state_ = State::Idle;  // the card is still present, which also blocks switching budgets
    changed();
  }
  void setText(const char *line1, const char *line2) {
    if (strcmp(text1_, line1 ? line1 : "") == 0 && strcmp(text2_, line2 ? line2 : "") == 0) return;
    copyText(text1_, sizeof(text1_), line1); copyText(text2_, sizeof(text2_), line2);
    if (!hasBudget_) changed();  // the text is only shown while there is no budget
  }

  // ---- the app's answer to a purchase ---------------------------------------------------
  // The id the purchase request was sent under (the wallet's event id). Call right after sending it.
  void setPendingTx(const char *id) { copyText(pendingTx_, sizeof(pendingTx_), id); }
  // The request could not be queued for sending: nothing is pending, tell the user.
  void failPending(uint32_t now) {
    awaitingTx_ = false; pendingTx_[0] = 0;
    if (state_ == State::Pending) { state_ = State::Idle; stateAt_ = now; endTransaction(now); beep_ = Beep::Error; changed(); }
  }
  // The app's verdict on purchase `id`. Returns false (and changes nothing) if `id` is not the purchase
  // this wallet is waiting for: an old result, one from before a reboot, or someone else's.
  bool onTransactionResult(const char *id, Mood mood, const char *message, uint32_t now) {
    if (!awaitingTx_ || pendingTx_[0] == 0 || !id || strcmp(id, pendingTx_) != 0) return false;
    awaitingTx_ = false; pendingTx_[0] = 0;
    if (state_ == State::Pending) {  // if the user has already moved on to another card, the budgets still update but no face
      resultMood_ = mood;
      copyText(resultMessage_, sizeof(resultMessage_), message);
      state_ = State::Result; stateAt_ = now;
      changed();
    }
    return true;
  }

  // ---- card reader in ----------------------------------------------------------
  // A card was recognised (also fires when swapping straight to another card).
  void onCardDetected(const char *uid, uint32_t now) {
    copyText(uid_, sizeof(uid_), uid);
    present_ = true;
    holdArmed_ = false;  // a button already held down must not confirm this card
    if (hasBudget_ && resolvePreview()) {
      state_ = State::Preview;
      beep_ = Beep::Detect;
    } else {
      state_ = State::Unknown;
      beep_ = Beep::Error;
    }
    stateAt_ = now;
    changed();
  }
  // The sensor no longer sees a card: cancel any preview and go back to normal.
  void onCardRemoved(uint32_t now) {
    bool wasPresent = present_;
    present_ = false;
    holdArmed_ = false;
    if (state_ == State::Preview || state_ == State::Unknown) {
      state_ = State::Idle; stateAt_ = now; changed();
    }
    if (wasPresent) endTransaction(now);  // the release of a hold, or a reflex tap, just after the card left
  }

  // ---- button in (already debounced) ------------------------------------------------
  void onButtonDown(uint32_t now) {
    down_ = true; downAt_ = now; longFired_ = false;
    holdArmed_ = state_ == State::Preview;  // only a press that starts during a preview counts
    // While a card is on the reader (or a preview / pending / result screen is up, or one just ended) the
    // button belongs to the purchase: this press must never switch budgets, not even when released later.
    pressBlocked_ = state_ != State::Idle || present_ || inLockout(now);
  }
  void onButtonUp(uint32_t now) {
    bool shortPress = down_ && !longFired_ && uint32_t(now - downAt_) < BUTTON_LONG_PRESS_MS;
    down_ = false; holdArmed_ = false;
    if (shortPress && !pressBlocked_ && state_ == State::Idle && !present_ && !inLockout(now) &&
        hasBudget_ && data_.categoryCount > 1) {
      page_ = (page_ + 1) % data_.categoryCount;
      changed();
    }
  }

  // Call every loop().
  void tick(uint32_t now) {
    if (state_ == State::Preview && down_ && holdArmed_ && !longFired_ &&
        uint32_t(now - downAt_) >= BUTTON_LONG_PRESS_MS) {
      longFired_ = true; holdArmed_ = false;
      confirm(now);
    }
    if (state_ == State::Pending && uint32_t(now - stateAt_) >= TX_REPLY_TIMEOUT_MS) {
      // No answer from the app. Balances stay as the app last published them.
      awaitingTx_ = false; pendingTx_[0] = 0; timedOut_ = true;
      state_ = State::Idle; stateAt_ = now; endTransaction(now); beep_ = Beep::Error; changed();
    }
    if (state_ == State::Result && uint32_t(now - stateAt_) >= RESULT_SCREEN_MS) {
      state_ = State::Idle; stateAt_ = now; endTransaction(now); changed();
    }
  }

  // ---- outputs -----------------------------------------------------------------
  // Fraction 0..1 of the confirm hold, or -1 when no hold is in progress.
  float holdProgress(uint32_t now) const {
    if (state_ != State::Preview || !down_ || !holdArmed_) return -1.0f;
    uint32_t held = uint32_t(now - downAt_);
    return held >= BUTTON_LONG_PRESS_MS ? 1.0f : float(held) / float(BUTTON_LONG_PRESS_MS);
  }
  Beep takeBeep() { Beep b = beep_; beep_ = Beep::None; return b; }
  bool takePurchase(PurchaseRequest &out) {
    if (!purchasePending_) return false;
    out = purchase_; purchasePending_ = false; return true;
  }
  // True once if the last purchase got no answer from the app in time.
  bool takeTimedOut() { bool t = timedOut_; timedOut_ = false; return t; }

  ScreenModel model() const {
    ScreenModel m;
    m.revision = revision_;
    m.pageCount = data_.categoryCount;
    m.page = page_;
    switch (state_) {
      case State::Idle:
        if (!hasBudget_) {
          m.kind = ScreenKind::Text; copyText(m.line1, sizeof(m.line1), text1_); copyText(m.line2, sizeof(m.line2), text2_);
          break;
        }
        m.kind = ScreenKind::Budget; fill(m, page_, 0);
        break;
      case State::Preview:
        m.kind = ScreenKind::Preview; fill(m, previewCat_, pendingAmount_);
        break;
      case State::Pending:
      case State::Result:
        // Frozen at confirm time so a budget update arriving mid-screen cannot change the picture.
        m.kind = state_ == State::Pending ? ScreenKind::Pending : ScreenKind::Result;
        copyText(m.title, sizeof(m.title), confirmTitle_);
        m.total = confirmTotal_; m.left = confirmLeft_; m.spend = confirmSpend_;
        if (state_ == State::Result) {
          m.mood = resultMood_;
          copyText(m.line1, sizeof(m.line1), resultMessage_[0] ? resultMessage_ : (resultMood_ == Mood::Happy ? "Nice choice!" : "Watch your budget"));
        }
        break;
      case State::Unknown:
        m.kind = ScreenKind::Unknown;
        copyText(m.line1, sizeof(m.line1), hasBudget_ ? "Unknown card" : "No budget yet");
        copyText(m.line2, sizeof(m.line2), uid_);
        break;
    }
    return m;
  }
  uint32_t revision() const { return revision_; }
  bool inPreview() const { return state_ == State::Preview; }
  bool hasBudget() const { return hasBudget_; }
  bool cardPresent() const { return present_; }
  bool awaitingResult() const { return awaitingTx_; }
  ScreenKind screen() const { return model().kind; }

 private:
  enum class State : uint8_t { Idle, Preview, Unknown, Pending, Result };

  // Remember when a transaction screen ended, so a press right afterwards (often the release of the hold,
  // or a reflex tap) does not switch budgets.
  void endTransaction(uint32_t now) { haveEnded_ = true; endedAt_ = now; }
  bool inLockout(uint32_t now) const { return haveEnded_ && uint32_t(now - endedAt_) < BUTTON_CYCLE_LOCKOUT_MS; }
  static bool sameBudget(const BudgetData &a, const BudgetData &b) {
    if (a.categoryCount != b.categoryCount || a.cardCount != b.cardCount) return false;
    for (uint8_t i = 0; i < a.categoryCount; ++i) {
      const BudgetCategory &x = a.categories[i], &y = b.categories[i];
      if (strcmp(x.id, y.id) || strcmp(x.name, y.name) || x.left != y.left || x.total != y.total) return false;
    }
    for (uint8_t i = 0; i < a.cardCount; ++i) {
      const CardRule &x = a.cards[i], &y = b.cards[i];
      if (strcmp(x.uid, y.uid) || strcmp(x.category, y.category) || x.amount != y.amount) return false;
    }
    return true;
  }
  // Finds the card's rule and category for the current uid_. Sets previewCat_/pendingAmount_.
  bool resolvePreview() {
    for (uint8_t i = 0; i < data_.cardCount; ++i) {
      if (strcmp(data_.cards[i].uid, uid_) != 0) continue;
      for (uint8_t c = 0; c < data_.categoryCount; ++c) {
        if (strcmp(data_.categories[c].id, data_.cards[i].category) != 0) continue;
        previewCat_ = c; pendingAmount_ = data_.cards[i].amount;
        return true;
      }
    }
    return false;
  }
  void confirm(uint32_t now) {
    const BudgetCategory &cat = data_.categories[previewCat_];
    copyText(purchase_.uid, sizeof(purchase_.uid), uid_);
    copyText(purchase_.category, sizeof(purchase_.category), cat.id);
    purchase_.amount = pendingAmount_;
    purchasePending_ = true;
    beep_ = Beep::Confirm;
    copyText(confirmTitle_, sizeof(confirmTitle_), cat.name);
    confirmTotal_ = cat.total; confirmLeft_ = cat.left; confirmSpend_ = pendingAmount_;
    awaitingTx_ = true; pendingTx_[0] = 0;
    page_ = previewCat_;
    state_ = State::Pending; stateAt_ = now;
    changed();
    // No local deduction: the balances change only when the app publishes them.
  }
  void fill(ScreenModel &m, uint8_t cat, int32_t spend) const {
    const BudgetCategory &c = data_.categories[cat];
    copyText(m.title, sizeof(m.title), c.name);
    m.total = c.total; m.left = c.left; m.spend = spend;
  }
  void changed() { ++revision_; }

  BudgetData data_;
  bool hasBudget_ = false, present_ = false, down_ = false, longFired_ = false, holdArmed_ = false;
  bool purchasePending_ = false, pressBlocked_ = false, haveEnded_ = false, awaitingTx_ = false, timedOut_ = false;
  uint32_t endedAt_ = 0;
  State state_ = State::Idle;
  uint8_t page_ = 0, previewCat_ = 0;
  int32_t pendingAmount_ = 0, confirmLeft_ = 0, confirmTotal_ = 0, confirmSpend_ = 0;
  char confirmTitle_[13] = "";
  char pendingTx_[40] = "", resultMessage_[33] = "";
  Mood resultMood_ = Mood::Happy;
  uint32_t stateAt_ = 0, downAt_ = 0, revision_ = 1;
  char uid_[33] = "", text1_[33] = "Smart wallet", text2_[33] = "Connecting...";
  Beep beep_ = Beep::None;
  PurchaseRequest purchase_ = {};
};
