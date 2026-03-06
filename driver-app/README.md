# Movido Driver App

Mobile app for HGV drivers built with **Expo + React Native + Supabase**.

## Features
- **Login** — Supabase auth with secure token storage
- **Home** — Status toggle (On Duty/Available/Off Duty/On Break), GPS tracking, active job card
- **Job Detail** — View pickup/delivery, navigate (TomTom GO / Google Maps), start/complete delivery, capture POD photo
- **Truck Check** — DVSA-compliant daily walk-around checklist (15 items), defect reporting, photo evidence
- **Messages** — Realtime chat with dispatch via Supabase

## GPS Tracking
- Live location pushed to Supabase every 10 seconds
- Dispatch sees driver positions in real-time on TomTom map
- Auto-starts when status is "On Duty"

## Quick Start

```bash
cd driver-app
npm install  # or: npx expo install
cp .env.example .env  # add your Supabase keys

npx expo start
# Scan QR with Expo Go app on your phone
```

## .env
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## Build for production
```bash
npx eas build --platform android
npx eas build --platform ios
```
