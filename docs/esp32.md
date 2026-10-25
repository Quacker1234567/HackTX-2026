# ESP32 Wi-Fi contract, v1

The app is the source of truth. Firmware is not implemented yet. No GPIO,
screen driver, or voltage assumptions are made by this starter.

Implement `POST /budget` on the ESP32 and return HTTP 200 only after accepting
the JSON payload. The Connections screen currently sends Dining manually.

```json
{
  "version": 1,
  "categoryId": "dining",
  "categoryName": "Dining",
  "budgetCents": 20000,
  "remainingCents": 4200,
  "previewCents": 0,
  "percentageRemaining": 21,
  "status": "blue",
  "updatedAt": "2026-10-24T22:00:00.000Z"
}
```

All money is integer cents. Use `previewCents` for the screen cutout. Preserve
negative remaining values in text; clamp only the visual fill. Status is blue,
amber (below 20%), or red (zero or negative). Always include text beside color.
An optional token is sent as `Authorization: Bearer <token>`; firmware must check
it if enabled. Never expose the device directly to the public internet.

For the web preview, firmware must handle OPTIONS/CORS for the development
origin and Content-Type/Authorization headers. A hosted HTTPS page cannot
normally call an HTTP LAN device: use a native development build, HTTPS device
gateway, or a future Firebase relay. Native platforms may also restrict cleartext
HTTP and require local-network permissions; configure those for the actual
hardware/build. A five-second request timeout prevents a disconnected wallet
from blocking the app. Connection status currently means only a manual request
was acknowledged; continuous presence detection is future work.

Future device-button confirmations need authenticated event IDs and deduplication
before they may commit a pending purchase. The starter confirms in-app only.
