# Movido — Deployment Guide

## Architecture
```
www.movidologistics.uk/           → Home (marketing landing page)
www.movidologistics.uk/pricing    → Pricing page
www.movidologistics.uk/login      → Supabase auth login
www.movidologistics.uk/dashboard  → Dispatch Center
www.movidologistics.uk/track/:id  → Public delivery tracking (no auth)

Movido Driver App              → Expo (Android/iOS)
```

## Step 1: Supabase Setup

1. Go to https://supabase.com/dashboard
2. Open your project (or create one)
3. Go to **SQL Editor**
4. Run `supabase/migrations/20260927000000_production_baseline.sql` → creates the full schema (new, empty project only)
5. Run `supabase/seed/001_sample_data.sql` → adds test fleet data

### Create first user:
1. Go to **Authentication > Users > Add user**
2. Email: `dispatch@movido.com`, Password: your choice
3. Copy the UUID shown
4. Run in SQL Editor:
```sql
INSERT INTO users (id, email, full_name, role)
VALUES ('PASTE-UUID-HERE', 'dispatch@movido.com', 'Dispatch Admin', 'dispatcher');
```

### Create storage bucket (for POD photos):
1. Go to **Storage > New bucket**
2. Name: `pod-photos`
3. Public: Yes
4. Click Create

### Get your keys:
- Project URL: Settings > API > URL
- Anon Key: Settings > API > anon / public

## Step 2: Deploy to Vercel (Dispatch Center)

### Option A: Via GitHub (recommended)
```bash
# 1. Create GitHub repo
cd movido-migrated
git init
git add -A
git commit -m "Movido v6 — full dispatch center"
git remote add origin https://github.com/YOUR-USERNAME/movido.git
git push -u origin main

# 2. Connect to Vercel
# Go to https://vercel.com/new
# Import your GitHub repo
# Framework: Vite
# Build command: vite build
# Output directory: dist
# Add environment variables (see below)
# Click Deploy
```

### Option B: Vercel CLI
```bash
npm i -g vercel
cd movido-migrated
vercel
# Follow prompts, add env vars in Vercel dashboard
```

### Environment Variables (add in Vercel dashboard):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-key...
VITE_TOMTOM_API_KEY=your-tomtom-key
```

### Custom domain:
Production is `https://www.movidologistics.uk` only (UK product). `movidologistics.uk` redirects to it.
`movidologistics.com` is not used and needs no configuration.

## Step 3: Driver App (Expo)

```bash
cd driver-app
npm install

# Create .env
cp .env.example .env
# Edit with your Supabase keys

# Run locally (Expo Go on phone)
npx expo start
# Scan QR code with Expo Go app

# Build APK for Android
npx eas build --platform android --profile preview

# Build for iOS (requires Apple Developer account)
npx eas build --platform ios --profile preview
```

## Tech Stack Summary
- **Frontend**: Vite + React 19 + Tailwind 4 + shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Maps**: TomTom Maps API (HGV routing, satellite, geocoding)
- **Charts**: Recharts
- **Mobile**: Expo + React Native
- **Hosting**: Vercel (free tier)
- **DNS**: Cloudflare (free)
- **Monthly cost**: £0 (free tiers) → ~£20/mo at scale
