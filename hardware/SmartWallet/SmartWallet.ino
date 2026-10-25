#define ENABLE_USER_AUTH
#define ENABLE_DATABASE
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <FirebaseClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include "config.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif
#include "firebase_ca.h"
#include "display_adapter.h"
#include "feedback.h"
#include "nfc_reader.h"
#include "remote_reader.h"
#include "wallet_ui.h"

WalletDisplay walletDisplay;
WalletBuzzer buzzer;
NfcReader nfc;
RemoteReader remoteReader;
WalletUi ui;
BudgetData incomingBudget;  // scratch for parsing; kept off the stack
uint32_t drawnRevision=0, simReleaseAt=0;
uint8_t simCard=0;
bool simHolding=false;
WiFiClientSecure authTls, streamTls;
AsyncClientClass ioClient(authTls), streamClient(streamTls);
UserAuth deviceAuth(FIREBASE_API_KEY, DEVICE_EMAIL, DEVICE_PASSWORD, 3000);
FirebaseApp firebaseApp;
RealtimeDatabase database;
bool authStarted=false, streamStarted=false, snapshotNeeded=false;
bool stateReceived=false, clockLogged=false, wasReady=false, wifiScanned=false;
uint32_t lastNetLog=0;
wl_status_t lastWifiStatus=WL_NO_SHIELD;
bool statusDirty=true, inFlight=false;
uint32_t lastWifiAttempt=0, lastStatusAt=0, lastIoAttempt=0;
uint32_t rawChangedAt=0, eventSequence=0;
bool rawPressed=false, stablePressed=false;
String bootId, basePath, lastCommandId, lastBuzzerId;
enum IoKind {IO_NONE, IO_EVENT, IO_STATUS, IO_SNAPSHOT};
IoKind ioKind=IO_NONE;
// Purchase confirmations are "durable": retried for longer than other events, because
// the user has already seen "confirmed" on the display.
struct PendingEvent {String id; String payload; uint32_t queuedAt=0; uint8_t attempts=0; bool durable=false;};
PendingEvent eventQueue[8];
uint8_t queueHead=0, queueSize=0;

void popEvent() {
  if (!queueSize) return;
  eventQueue[queueHead]=PendingEvent();
  queueHead=(queueHead+1)%8; --queueSize;
}
// Returns the id the event will be stored under (the app replies to a purchase using it), or "" if the queue is full.
String enqueueEvent(JsonDocument &doc, bool durable=false) {
  if (queueSize>=8) {Serial.println("Event queue full; event dropped"); return "";}
  doc["boot_id"]=bootId; doc["sequence"]=++eventSequence; doc["uptime_ms"]=millis();
  doc["created_at"][".sv"]="timestamp";
  uint8_t index=(queueHead+queueSize)%8;
  eventQueue[index].id=bootId+"-"+String(eventSequence);
  serializeJson(doc,eventQueue[index].payload);
  eventQueue[index].queuedAt=millis(); eventQueue[index].durable=durable; ++queueSize;
  return eventQueue[index].id;
}
// The user held the button to confirm the previewed purchase. The wallet beeped and shows "waiting for
// the app"; this notifies the app, which makes the real transaction, recalculates the budgets and answers
// with new budgets plus a happy/sad verdict (desired.transaction). The wallet changes no balance itself.
void sendPurchase(const PurchaseRequest &p) {
  Serial.printf("Purchase confirmed: %s %ld cents (%s)\n",p.category,long(p.amount),p.uid);
  JsonDocument doc;
  doc["type"]="purchase_confirm"; doc["uid"]=p.uid; doc["category"]=p.category;
  doc["amount_cents"]=p.amount;
  doc["simulated"]=strncmp(p.uid,"DEMO-",5)==0;  // serial-simulated cards are flagged; real NFC cards are not
  String txId=enqueueEvent(doc,true);
  if (txId.length()) {
    ui.setPendingTx(txId.c_str());  // the app's answer names this id
    Serial.printf("Purchase sent to the app as %s; waiting for its answer\n",txId.c_str());
  } else ui.failPending(millis());
}
// A card was presented to the reader (or simulated over serial); the UI decides what it means.
void onCardUid(const char *uid,uint32_t now) {
  Serial.printf("NFC card detected: %s\n",uid);
  ui.onCardDetected(uid,now);
}
void playBeep(Beep kind,uint32_t now) {
  switch (kind) {
    case Beep::Detect: {
      static uint32_t lastDetectBeep=0; static bool beeped=false;
      if (beeped && uint32_t(now-lastDetectBeep)<BEEP_DETECT_MIN_GAP_MS) break;
      beeped=true; lastDetectBeep=now;
      buzzer.start(true,BEEP_DETECT_ON_MS,50,1,BUZZER_DEFAULT_HZ,now);
      break;
    }
    case Beep::Confirm: buzzer.start(true,BEEP_CONFIRM_ON_MS,BEEP_CONFIRM_OFF_MS,BEEP_CONFIRM_COUNT,BUZZER_DEFAULT_HZ,now); break;
    case Beep::Error: buzzer.start(true,BEEP_ERROR_ON_MS,50,1,BEEP_ERROR_HZ,now); break;
    case Beep::None: break;
  }
}

bool validLine(JsonVariantConst value) {
  if (!value.is<const char *>()) return false;
  const char *s = value.as<const char *>();
  if (strlen(s) > 32) return false;
  for (; *s; ++s) if (uint8_t(*s) < 32 || uint8_t(*s) > 126) return false;
  return true;
}

bool validToken(const char *s, size_t maxLen, bool allowUpper) {
  size_t n = strlen(s);
  if (n == 0 || n > maxLen) return false;
  for (; *s; ++s) {
    bool ok = (*s >= 'a' && *s <= 'z') || (*s >= '0' && *s <= '9') || *s == '-' || *s == '_' ||
              (allowUpper && ((*s >= 'A' && *s <= 'Z') || *s == ':'));
    if (!ok) return false;
  }
  return true;
}

// A purchase id as made by this firmware: the boot id (16 lowercase hex digits), '-', then the event sequence number.
bool validTxId(const char *s) {
  size_t n = strlen(s);
  if (n < 18 || n > 27 || s[16] != '-') return false;
  for (size_t i = 0; i < 16; ++i) if (!((s[i] >= '0' && s[i] <= '9') || (s[i] >= 'a' && s[i] <= 'f'))) return false;
  for (size_t i = 17; i < n; ++i) if (s[i] < '0' || s[i] > '9') return false;
  return true;
}

// Fills `out` from the "budget" section ({categories:[...], cards:[...]}); money is in cents.
// Returns false (leaving the display untouched) if anything is out of range.
bool parseBudget(JsonVariantConst value, BudgetData &out) {
  JsonArrayConst cats = value["categories"].as<JsonArrayConst>();
  JsonArrayConst cards = value["cards"].as<JsonArrayConst>();  // Realtime Database drops empty arrays
  if (cats.isNull() || cats.size() == 0 || cats.size() > MAX_CATEGORIES || cards.size() > MAX_CARDS) return false;
  out = BudgetData();
  for (JsonVariantConst c : cats) {
    const char *id = c["id"] | "", *name = c["name"] | "";
    if (!validToken(id, 12, false) || !validLine(c["name"]) || strlen(name) == 0 || strlen(name) > 12) return false;
    if (!c["left_cents"].is<int32_t>() || !c["total_cents"].is<int32_t>() || c["total_cents"].as<int32_t>() <= 0) return false;
    for (uint8_t i = 0; i < out.categoryCount; ++i) if (strcmp(out.categories[i].id, id) == 0) return false;
    BudgetCategory &k = out.categories[out.categoryCount++];
    copyText(k.id, sizeof(k.id), id); copyText(k.name, sizeof(k.name), name);
    k.left = c["left_cents"].as<int32_t>(); k.total = c["total_cents"].as<int32_t>();
  }
  for (JsonVariantConst c : cards) {
    const char *uid = c["uid"] | "", *category = c["category"] | "";
    if (!validToken(uid, 32, true) || !validToken(category, 12, false)) return false;
    if (!c["amount_cents"].is<int32_t>() || c["amount_cents"].as<int32_t>() <= 0) return false;
    bool known = false;
    for (uint8_t i = 0; i < out.categoryCount; ++i) if (strcmp(out.categories[i].id, category) == 0) known = true;
    if (!known) return false;
    CardRule &r = out.cards[out.cardCount++];
    copyText(r.uid, sizeof(r.uid), uid); copyText(r.category, sizeof(r.category), category);
    r.amount = c["amount_cents"].as<int32_t>();
  }
  return true;
}

bool validUpdate(JsonDocument &doc) {
  if (!doc["command_id"].is<const char *>()) return false;
  size_t idLength = strlen(doc["command_id"].as<const char *>());
  if (idLength == 0 || idLength > 64) return false;
  // Backend always supplies a complete display state, with an optional buzzer.
  if (!validLine(doc["display"]["line1"]) || !validLine(doc["display"]["line2"])) return false;
  if (!doc["buzzer"].isNull()) {
    JsonVariantConst b = doc["buzzer"];
    if (!b.is<JsonObjectConst>() || !b["enabled"].is<bool>() ||
        !b["on_ms"].is<uint32_t>() || !b["off_ms"].is<uint32_t>() ||
        !b["count"].is<uint8_t>() || !b["frequency_hz"].is<uint16_t>()) return false;
    if (b["on_ms"].as<uint32_t>() < 10 || b["on_ms"].as<uint32_t>() > 1000 ||
        b["off_ms"].as<uint32_t>() < 10 || b["off_ms"].as<uint32_t>() > 1000 ||
        b["count"].as<uint8_t>() < 1 || b["count"].as<uint8_t>() > 10 ||
        b["frequency_hz"].as<uint16_t>() < 100 || b["frequency_hz"].as<uint16_t>() > 8000) return false;
  }
  return true;
}

// Debounces the button and hands press/release edges to the UI, which decides what a
// short press (cycle budgets) or a hold (confirm purchase) means.
void tickButton(uint32_t now) {
  if (PIN_BUTTON < 0) return;
  bool pressed = digitalRead(PIN_BUTTON) == (BUTTON_ACTIVE_LOW ? LOW : HIGH);
  if (pressed != rawPressed) { rawPressed = pressed; rawChangedAt = now; }
  if (pressed != stablePressed && uint32_t(now - rawChangedAt) >= BUTTON_DEBOUNCE_MS) {
    stablePressed = pressed;
    if (pressed) ui.onButtonDown(now); else ui.onButtonUp(now);
  }
}

void handleState(const char *payload) {
  if (!payload) {Serial.println("State: nothing at control/desired yet (publish a budget from the app or the console)"); return;}
  if (strlen(payload)>MAX_MESSAGE_BYTES) {Serial.printf("State ignored: %u bytes is over the %u byte limit\n",unsigned(strlen(payload)),unsigned(MAX_MESSAGE_BYTES)); return;}
  JsonDocument doc;
  DeserializationError parseError=deserializeJson(doc,payload);
  if (parseError) {Serial.printf("State ignored: not valid JSON (%s)\n",parseError.c_str()); return;}
  if (!validUpdate(doc)) {Serial.println("State ignored: needs command_id (1-64 chars) and display.line1/line2 (printable ASCII, 32 chars max)"); return;}
  if (strcmp(doc["type"] | "", "device_update") != 0) {Serial.println("State ignored: type must be \"device_update\""); return;}
  const char *id=doc["command_id"];
  if (lastCommandId==id) return;
  bool hasBudget=!doc["budget"].isNull();
  if (hasBudget && !parseBudget(doc["budget"],incomingBudget)) {
    Serial.println("State ignored: the budget section is invalid (1-8 categories with id a-z0-9_-, name up to 12 chars, whole-number cents; cards must name a known category)");
    return;
  }
  // The app's verdict on a purchase: {id, mood: "happy"|"sad", message?}. Validated before anything is applied.
  bool hasTransaction=!doc["transaction"].isNull();
  const char *txId="", *txMessage="";
  Mood txMood=Mood::Happy;
  if (hasTransaction) {
    JsonVariantConst t=doc["transaction"];
    txId=t["id"] | ""; txMessage=t["message"] | "";
    const char *mood=t["mood"] | "";
    bool moodOk=strcmp(mood,"happy")==0 || strcmp(mood,"sad")==0;
    if (!validTxId(txId) || !moodOk || (!t["message"].isNull() && !validLine(t["message"]))) {
      Serial.println("State ignored: transaction needs the purchase id, mood \"happy\" or \"sad\", and an optional message of up to 32 printable characters");
      return;
    }
    txMood=strcmp(mood,"sad")==0 ? Mood::Sad : Mood::Happy;
  }
  uint32_t now=millis();
  // The text lines are the fallback screen; once a budget exists the UI draws budgets instead.
  ui.setText(doc["display"]["line1"].as<const char *>(),doc["display"]["line2"].as<const char *>());
  if (hasBudget) ui.setBudget(incomingBudget);
  if (hasTransaction) {
    bool ours=ui.onTransactionResult(txId,txMood,txMessage,now);
    Serial.printf("Answer from the app for purchase %s: %s (%s)\n",txId,txMood==Mood::Happy ? "happy" : "sad",ours ? "showing it" : "not the purchase this wallet is waiting for, ignored");
  }
  if (!doc["buzzer"].isNull()) {
    JsonObject b=doc["buzzer"];
    uint64_t unixMs=uint64_t(time(nullptr))*1000;
    // Restore persistent state, but execute only a fresh effect for this boot session.
    if (b["target_boot_id"].is<const char *>() && bootId==b["target_boot_id"].as<const char *>() &&
        b["expires_at"].is<uint64_t>() && b["expires_at"].as<uint64_t>()>=unixMs &&
        b["expires_at"].as<uint64_t>()<=unixMs+15000 && lastBuzzerId!=id) {
      buzzer.start(b["enabled"],b["on_ms"],b["off_ms"],b["count"],b["frequency_hz"],now);
      lastBuzzerId=id;
    }
  }
  lastCommandId=id; statusDirty=true; stateReceived=true;
  Serial.printf("State applied: command %s, %u categories, %u cards\n",id,unsigned(hasBudget ? incomingBudget.categoryCount : 0),unsigned(hasBudget ? incomingBudget.cardCount : 0));
}
// A card event relayed by the laptop bridge: wallets/<id>/control/desired/reader = {seq, present, uid}.
void handleReaderMessage(const char *payload) {
  uint32_t now=millis();
  JsonDocument doc;
  RemoteReader::Event event;
  if (!payload || deserializeJson(doc,payload) || !doc.is<JsonObject>()) {
    event=remoteReader.onCleared(now);  // node deleted: no card
  } else {
    bool present=doc["present"].is<bool>() && doc["present"].as<bool>();
    const char *uid=doc["uid"] | "";
    if (!doc["seq"].is<uint64_t>() || (present && !validToken(uid,32,true))) {
      Serial.println("Reader message ignored: needs a numeric seq and, when present, a valid uid");
      return;
    }
    event=remoteReader.onMessage(doc["seq"].as<uint64_t>(),present,uid,now);
  }
  if (event==RemoteReader::Detected) onCardUid(remoteReader.uid(),now);
  else if (event==RemoteReader::Removed) {Serial.println("NFC card removed"); ui.onCardRemoved(now);}
}
void onStream(AsyncResult &result) {
  if (result.isError()) {Serial.printf("Firebase stream error %d: %s (retrying)\n",result.error().code(),result.error().message().c_str()); return;}
  if (!result.available()) return;
  RealtimeDatabaseResult &event=result.to<RealtimeDatabaseResult>();
  if (!event.isStream()) return;
  String kind=event.event();
  if (kind!="keep-alive") Serial.printf("Stream event: %s at \"%s\"\n",kind.c_str(),event.dataPath().c_str());
  if (kind=="cancel" || kind=="auth_revoked") {Serial.println("Stream access revoked; check credentials/access"); return;}
  if (kind!="put" && kind!="patch") return;
  String path=event.dataPath();
  if (path=="/reader" && kind=="put") handleReaderMessage(event.to<const char *>());  // live card event from the bridge
  else if (path=="/" && kind=="put") handleState(event.to<const char *>());
  else if (!path.startsWith("/reader")) snapshotNeeded=true;
}
void onAuth(AsyncResult &result) {
  // Never log tokens or raw authentication responses.
  if (result.isError()) Serial.printf("Firebase sign-in error %d: %s\n",result.error().code(),result.error().message().c_str());
}
void onIo(AsyncResult &result) {
  if (!result.isError() && !result.available()) return;
  if (result.isError()) {
    Serial.printf("Firebase write/read error %d: %s\n",result.error().code(),result.error().message().c_str());
    if (ioKind==IO_EVENT && queueSize && ++eventQueue[queueHead].attempts>=(eventQueue[queueHead].durable ? PURCHASE_MAX_ATTEMPTS : 3)) popEvent();
    if (ioKind==IO_STATUS) statusDirty=true;
    if (ioKind==IO_SNAPSHOT) snapshotNeeded=true;
  } else {
    if (ioKind==IO_EVENT) popEvent();
    if (ioKind==IO_SNAPSHOT) handleState(result.c_str());
  }
  inFlight=false; ioKind=IO_NONE; lastIoAttempt=millis();
}
const char *wifiStatusName(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS: return "idle (connecting)";
    case WL_NO_SSID_AVAIL: return "network not found (check the name; 2.4 GHz only; iPhone hotspots often use a curly apostrophe)";
    case WL_CONNECTED: return "connected";
    case WL_CONNECT_FAILED: return "connection failed (wrong password?)";
    case WL_CONNECTION_LOST: return "connection lost";
    case WL_DISCONNECTED: return "disconnected";
    default: return "unknown";
  }
}
// Lists the 2.4 GHz networks this board can see, with the raw bytes of each name, so a name that
// only differs by a curly apostrophe or a trailing space is easy to spot. Blocks for a few seconds.
void printName(const String &name) {
  Serial.printf("\"%s\" [", name.c_str());
  for (size_t i=0;i<name.length();++i) Serial.printf(i ? " %02X" : "%02X",uint8_t(name[i]));
  Serial.print("]");
}
void scanWifi() {
  Serial.println("Wi-Fi scan: networks this board can see (2.4 GHz only)...");
  WiFi.disconnect();
  int found=WiFi.scanNetworks(false,true);
  Serial.print("  configured name: "); printName(String(WIFI_SSID)); Serial.println();
  if (found<=0) Serial.println("  no networks found: antenna/board problem, or the hotspot is not broadcasting on 2.4 GHz");
  for (int i=0;i<found && i<20;++i) {
    String name=WiFi.SSID(i);
    Serial.printf("  %s ch%d %ddBm  ",name==WIFI_SSID ? "MATCH" : "     ",int(WiFi.channel(i)),int(WiFi.RSSI(i)));
    printName(name); Serial.println();
  }
  WiFi.scanDelete();
  lastWifiAttempt=millis()-WIFI_RETRY_MS;  // retry the connection right away
}
void printNetStatus() {
  Serial.printf("[net] wifi=%s | clock=%s | sign-in=%s | live state=%s\n",
    wifiStatusName(WiFi.status()), time(nullptr)>1700000000 ? "synced" : "waiting",
    !authStarted ? "not started" : (firebaseApp.ready() ? "ok" : "in progress"),
    stateReceived ? "received" : "none yet");
}
void tickFirebase(uint32_t now) {
  wl_status_t wifiStatus=WiFi.status();
  bool wifiReady=wifiStatus==WL_CONNECTED;
  if (wifiStatus!=lastWifiStatus) {
    lastWifiStatus=wifiStatus;
    if (wifiReady) Serial.printf("Wi-Fi connected to \"%s\", IP %s, signal %d dBm\n",WiFi.SSID().c_str(),WiFi.localIP().toString().c_str(),int(WiFi.RSSI()));
    else Serial.printf("Wi-Fi: %s\n",wifiStatusName(wifiStatus));
    if (wifiStatus==WL_NO_SSID_AVAIL && !wifiScanned) {wifiScanned=true; scanWifi();}  // once per boot; 's' repeats it
  }
  if (!wifiReady && uint32_t(now-lastWifiAttempt)>=WIFI_RETRY_MS) {
    lastWifiAttempt=now; WiFi.disconnect(); WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
    Serial.printf("Wi-Fi: connecting to \"%s\"...\n",WIFI_SSID);
  }
  if (!clockLogged && time(nullptr)>1700000000) {clockLogged=true; Serial.println("Clock synced (needed for secure connections)");}
  // Until the first state arrives, a status line every 10 s says exactly where it is stuck.
  if (!stateReceived && uint32_t(now-lastNetLog)>=10000) {lastNetLog=now; printNetStatus();}
  // NTP runs in the background; valid UTC is required for verified TLS.
  if (!authStarted && wifiReady && time(nullptr)>1700000000) {
    authStarted=true;
    Serial.println("Firebase: signing in with the device account...");
    initializeApp(ioClient,firebaseApp,getAuth(deviceAuth),onAuth,"auth");
    firebaseApp.getApp<RealtimeDatabase>(database); database.url(FIREBASE_DATABASE_URL);
  }
  if (!authStarted) { walletDisplay.setOnline(false); return; }
  firebaseApp.loop();
  bool online=firebaseApp.ready() && wifiReady;
  walletDisplay.setOnline(online);  // header dot: green = cloud connected
  if (online && !wasReady) {wasReady=true; Serial.println("Firebase: signed in");}
  if (!online) wasReady=false;
  if (!online) return;
  if (!streamStarted) {
    streamStarted=true;
    Serial.printf("Firebase: listening for %s/control/desired\n",basePath.c_str());
    streamClient.setSSEFilters("get,put,patch,keep-alive,cancel,auth_revoked");
    database.get(streamClient,basePath+"/control/desired",onStream,true,"desired");
  }
  if (inFlight || uint32_t(now-lastIoAttempt)<FIREBASE_RETRY_MS) return;
  while (queueSize && uint32_t(now-eventQueue[queueHead].queuedAt)>(eventQueue[queueHead].durable ? PURCHASE_MAX_AGE_MS : EVENT_MAX_AGE_MS)) popEvent();
  // Serialize outgoing requests and bound the event queue to eight entries.
  if (statusDirty || uint32_t(now-lastStatusAt)>=STATUS_INTERVAL_MS) {
    JsonDocument status;
    status["boot_id"]=bootId; status["last_seen"][".sv"]="timestamp";
    status["last_ack_id"]=lastCommandId; status["firmware"]="smart-wallet-firebase-0.4";
    String body; serializeJson(status,body);
    statusDirty=false; lastStatusAt=now; inFlight=true; ioKind=IO_STATUS;
    database.set<object_t>(ioClient,basePath+"/status",object_t(body),onIo,"status");
  } else if (snapshotNeeded) {
    snapshotNeeded=false; inFlight=true; ioKind=IO_SNAPSHOT;
    database.get(ioClient,basePath+"/control/desired",onIo,false,"snapshot");
  } else if (queueSize) {
    inFlight=true; ioKind=IO_EVENT;
    database.set<object_t>(ioClient,basePath+"/events/"+eventQueue[queueHead].id,
                           object_t(eventQueue[queueHead].payload),onIo,"event");
  }
}
void setup() {
  Serial.begin(115200);
  char session[17]; snprintf(session,sizeof(session),"%08lx%08lx",(unsigned long)esp_random(),(unsigned long)esp_random());
  bootId=session; basePath=String("/wallets/")+DEVICE_ID;
  buzzer.begin();
  // Grove Button has its own pull-down; the internal one is extra insurance when
  // the cable is unplugged. GPIO34-39 are input-only and have no internal pulls.
  if (PIN_BUTTON>=0) pinMode(PIN_BUTTON,BUTTON_ACTIVE_LOW ? INPUT_PULLUP : (PIN_BUTTON>=34 ? INPUT : INPUT_PULLDOWN));
  walletDisplay.begin(); walletDisplay.draw(ui.model()); drawnRevision=ui.revision();
  nfc.begin();
  authTls.setCACert(FIREBASE_ROOT_CA); streamTls.setCACert(FIREBASE_ROOT_CA);
  authTls.setHandshakeTimeout(5); streamTls.setHandshakeTimeout(5);
  WiFi.persistent(false); WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID,WIFI_PASSWORD); lastWifiAttempt=millis();
  configTime(0,0,"time.google.com","pool.ntp.org");
  Serial.println("Waiting for Wi-Fi/time sync. Serial: n = next fake card, x = remove card, b = short press, h = hold (confirm), c = NFC reader debug, w = network status, s = scan Wi-Fi");
}
void loop() {
  uint32_t now=millis();
  buzzer.tick(now); tickButton(now);
  nfc.tick(now);
  char cardUid[2*pn532::MAX_UID+1];
  if (nfc.takeCard(cardUid)) onCardUid(cardUid,now);
  if (nfc.takeRemoved()) {Serial.println("NFC card removed"); ui.onCardRemoved(now);}
  if (ENABLE_REMOTE_READER && remoteReader.tick(now)==RemoteReader::Removed) {
    Serial.println("NFC card removed (bridge went quiet)"); ui.onCardRemoved(now);
  }
  for (uint8_t i=0;i<8 && Serial.available();++i) {
    char command=Serial.read();
    // Hardware-free testing: these drive the same UI paths as the sensor and button.
    if ((command=='n' || command=='N') && ENABLE_SIMULATED_NFC) {onCardUid(SIM_CARD_UIDS[simCard],now); simCard=(simCard+1)%SIM_CARD_COUNT;}
    else if (command=='x' || command=='X') ui.onCardRemoved(now);
    else if (command=='b' || command=='B') {ui.onButtonDown(now); ui.onButtonUp(now);}
    else if (command=='h' || command=='H') {ui.onButtonDown(now); simHolding=true; simReleaseAt=now+BUTTON_LONG_PRESS_MS+300;}
    else if (command=='c' || command=='C') nfc.toggleDebug();
    else if (command=='w' || command=='W') printNetStatus();
    else if (command=='s' || command=='S') scanWifi();
  }
  if (simHolding && int32_t(now-simReleaseAt)>=0) {simHolding=false; ui.onButtonUp(now);}
  ui.tick(now);
  Beep beep=ui.takeBeep();
  if (beep!=Beep::None) playBeep(beep,now);
  PurchaseRequest purchase;
  if (ui.takePurchase(purchase)) sendPurchase(purchase);
  if (ui.takeTimedOut()) Serial.println("No answer from the app in time; showing the budgets as last published");
  if (ui.revision()!=drawnRevision) {drawnRevision=ui.revision(); walletDisplay.draw(ui.model());}
  if (ui.inPreview()) walletDisplay.drawHold(ui.holdProgress(now));
  tickFirebase(now);
  // Feedback has no delay() loops; TLS handshakes and display I/O can briefly block.
}
