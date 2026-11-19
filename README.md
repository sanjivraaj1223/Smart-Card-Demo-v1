# Guhanix SmartCard V1

A futuristic full-screen digital smart card interface built with HTML, CSS, and JavaScript.

## Features

- **Full-screen landscape display** — the entire viewport is the card surface
- **Luxury Black & Gold theme** — metallic gold and silver gradients, premium typography
- **7 screens** — Home, Wallet, Transfer, History, NFC Pay, Security, Settings
- **QR Code Scanner** — uses device camera with animated scan frame
- **NFC Payment simulation** — tap-to-pay with animated ring pulse
- **Biometric authentication** — fingerprint scan simulation with progress indicator
- **Portrait lock** — shows rotate prompt when device is held vertically
- **PIN lock / unlock** — PIN: `1234`
- **Auto screen timeout** — locks after 60 seconds of inactivity
- **Swipe navigation** — swipe left/right to move between screens

## Screens

| Screen | Description |
|---|---|
| Home | Balance, quick actions, recent transactions |
| Wallet | Card visual, account details, balance breakdown |
| Transfer | 4-step send money flow with numpad |
| History | Full transaction list with date groups |
| NFC Pay | Contactless payment with biometric option |
| Security | PIN verification, card lock, security log |
| Settings | Brightness, sound, battery, device info |

## Tech Stack

- Pure HTML5, CSS3, Vanilla JavaScript
- No frameworks, no dependencies
- Self-contained single `index.html` (all CSS and JS inlined)
- Modular architecture: `tokens.css`, `app.css`, `app.js`, `index.html`

## Usage

Open `index.html` in any modern browser.

For best experience use landscape orientation or a widescreen display.

**Demo PIN:** `1234`

## Product

**Brand:** Guhanix Technology  
**Product:** SmartCard V1  
**Orientation:** Landscape  
**Display:** Full-face touchscreen simulation  
**Hardware target:** ESP32-S3 with flexible OLED display

## License

MIT
