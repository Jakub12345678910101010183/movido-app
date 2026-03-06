# 🚀 Jak uruchomić Movido Driver App

## Wymagania
- Node.js 18+
- Expo Go na telefonie (iOS lub Android) — pobierz ze sklepu
- Telefon i komputer w tej samej sieci Wi-Fi

## Krok 1 — Zainstaluj zależności
Otwórz terminal w folderze `driver-app/` i wpisz:

```bash
cd movido-v12-CLEAN/driver-app
npm install
```

## Krok 2 — Uruchom aplikację

```bash
npx expo start
```

## Krok 3 — Otwórz na telefonie
- **iPhone:** Otwórz kamerę i zeskanuj QR kod który pojawi się w terminalu
- **Android:** Otwórz aplikację Expo Go → zeskanuj QR kod

## Login testowy
```
Email: dispatch@movido.com
Hasło: Movido2024!
```

---

## Co zostało naprawione (Claude — 28 Feb 2026)

| Problem | Plik | Status |
|---|---|---|
| `"main": "expo-router/entry"` → `"main": "App.tsx"` | package.json | ✅ |
| Usunięto `expo-router` (konflikt z React Navigation) | package.json | ✅ |
| Import paths `./hooks/` → `./src/hooks/` | App.tsx | ✅ |
| Duplikaty `import { t }` | 4 screens | ✅ |
| Zła nazwa kolumny `last_location_update` → `location_updated_at` | useGPSTracking.ts | ✅ |
| Nieprawidłowy enum `"other"` → `"inspection"` | TruckCheckScreen.tsx | ✅ |
| Zepsuty upload zdjęć (fetch base64) → Uint8Array/atob | DocumentScannerScreen.tsx | ✅ |
| Brakujące kolumny `heading` i `speed` w Supabase DB | Migration 005 | ✅ |
| Brakujący `.env` z kluczami Supabase | .env | ✅ |
| Brakujący `babel.config.js` | babel.config.js | ✅ |
| Brakujący `metro.config.js` | metro.config.js | ✅ |
| Brakujący folder `assets/` | assets/ | ✅ |
| Brakujący splash image w app.json | app.json | ✅ |
| Brakujący adaptiveIcon foregroundImage | app.json | ✅ |
