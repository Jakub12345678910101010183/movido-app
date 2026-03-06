# Movido Migration Guide: Manus → Supabase + TomTom

## Overview

This document describes the migration from the Manus AI stack to the production Movido stack.

### What Changed

| Component | Before (Manus) | After (Production) |
|-----------|----------------|-------------------|
| Database | MySQL + Drizzle ORM | **Supabase PostgreSQL** |
| Auth | Manus OAuth + JWT cookies | **Supabase Auth** |
| Maps | Google Maps (via Manus proxy) | **TomTom Maps SDK** |
| Geocoding | Google Geocoding API | **TomTom Search API** |
| Routing | Google Directions API | **TomTom Routing API (HGV)** |
| Distance Matrix | Google Distance Matrix | **TomTom Matrix Routing** |
| Realtime | N/A (polling) | **Supabase Realtime** |
| Data access | tRPC + Express | **Supabase client (direct)** + tRPC for complex logic |

### What Stayed The Same

- Frontend framework: React 19 + Vite + Tailwind 4
- UI library: shadcn/ui (all components preserved)
- Design: Terminal Noir aesthetic (all CSS variables preserved)
- Routing: wouter (all pages preserved)
- State: React Query + tRPC (tRPC kept for route optimization)
- All page components (Dashboard, Jobs, Fleet, Drivers, etc.)

---

## New Files Created

### Database & Auth
- `supabase/migrations/001_initial_schema.sql` — Full PostgreSQL schema
- `client/src/lib/supabase.ts` — Supabase client
- `client/src/lib/database.types.ts` — TypeScript types for all tables
- `client/src/hooks/useAuth.ts` — Auth hook (login/signup/logout)
- `client/src/contexts/AuthContext.tsx` — Auth context provider
- `client/src/pages/Login.tsx` — Login/register page

### TomTom Maps
- `client/src/components/TomTomMap.tsx` — Map component + geocoding/routing services

### Data Hooks
- `client/src/hooks/useSupabaseData.ts` — Realtime CRUD hooks for all entities

### Config
- `.env.example` — All required environment variables

---

## Setup Steps

### 1. Supabase Project

1. Create a project at https://supabase.com
2. Go to **SQL Editor** and run `supabase/migrations/001_initial_schema.sql`
3. Go to **Database → Replication** and verify these tables have realtime enabled:
   - drivers, jobs, vehicles, messages
4. Copy your Project URL and anon key from **Settings → API**

### 2. TomTom Developer Account

1. Register at https://developer.tomtom.com
2. Create an API key with these products enabled:
   - Maps SDK
   - Search API
   - Routing API
   - Matrix Routing API
3. Copy the API key

### 3. Environment Variables

```bash
cp .env.example .env
```

Fill in:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_TOMTOM_API_KEY=your_key
```

### 4. Install New Dependencies

```bash
pnpm add @supabase/supabase-js
```

### 5. Update Imports in Existing Pages

The existing pages (Dashboard, Fleet, Drivers, Jobs) currently use `trpc` for data fetching.
To migrate them, replace:

```tsx
// OLD (tRPC)
import { trpc } from "@/lib/trpc";
const { data: vehicles } = trpc.vehicles.list.useQuery();

// NEW (Supabase)
import { useVehicles } from "@/hooks/useSupabaseData";
const { vehicles, isLoading } = useVehicles();
```

For the Map component:
```tsx
// OLD
import { MapView } from "@/components/Map";

// NEW
import { TomTomMap } from "@/components/TomTomMap";
```

### 6. Update App.tsx

Add AuthProvider and Login route:

```tsx
import { AuthProvider, RequireAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";

// In Router:
<Route path="/login" component={Login} />

// Wrap protected routes:
<RequireAuth fallback={<Login />}>
  <Route path="/dashboard" component={Dashboard} />
  ...
</RequireAuth>
```

---

## Database Schema Improvements

The new schema adds several improvements over the original Drizzle schema:

1. **UUID user IDs** linked to Supabase Auth (instead of auto-increment integers)
2. **GPS coordinates on drivers** (`location_lat`, `location_lng`, `location_updated_at`)
3. **GPS coordinates on vehicles** for live tracking
4. **Pickup/delivery coordinates on jobs** for map display
5. **Messages table** for internal messenger (new feature)
6. **Fleet maintenance table** for service tracking (new feature)
7. **Row Level Security (RLS)** for proper access control
8. **Auto-update triggers** for `updated_at` columns
9. **Auto-create user profile** on Supabase Auth sign-up
10. **Realtime replication** enabled for drivers, jobs, vehicles, messages

---

## What's Left to Migrate

Each existing page needs its tRPC calls replaced with Supabase hooks.
The tRPC server can be kept for complex operations (route optimization)
that need server-side processing. Simple CRUD should use Supabase directly.

Priority order:
1. ✅ Schema + Auth + Map component + Data hooks
2. ✅ Dashboard.tsx — TomTomMap + Supabase realtime
3. ✅ Fleet.tsx — useVehicles() CRUD
4. ✅ Drivers.tsx — useDrivers() CRUD
5. ✅ Jobs.tsx — useJobs() CRUD + vehicle/driver assignment
6. ✅ AIRoutePlanner.tsx — TomTom geocoding + HGV routing + Supabase jobs
7. ✅ App.tsx — AuthProvider + RequireAuth protected routes + /login
8. TODO: Routes.tsx, Alerts.tsx, Analytics.tsx, Reports.tsx, Settings.tsx — lighter pages
9. TODO: Install `@supabase/supabase-js` in package.json
10. TODO: Remove Manus-specific files (_core/oauth.ts, sdk.ts, map.ts)
11. TODO: Messenger UI, Fleet Maintenance UI, POD photo capture
12. TODO: Driver Mobile App (Expo/React Native)
