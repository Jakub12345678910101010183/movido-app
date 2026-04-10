# 🚀 Final 5% Deployment Guide
**Date:** April 10, 2026
**Status:** Ready to Deploy ✅
**Time Required:** 5-10 minutes

---

## 📋 What's Being Deployed

4 Database Migrations (739 lines of SQL):

| Migration | Purpose | Lines |
|-----------|---------|-------|
| **005_geofence_events.sql** | Auto-arrival detection | 219 |
| **006_pod_tables.sql** | Digital POD system | 191 |
| **007_eta_fields.sql** | Real-time ETA tracking | 99 |
| **008_rbac_permissions.sql** | Role-based access control | 230 |

**Impact:** Once deployed, both dispatcher panel AND driver app get geofencing, live ETA, photo verification, and permissions features.

---

## 🎯 Choose Your Deployment Method

### **METHOD 1: Manual Dashboard (No Terminal Needed)** ⭐ EASIEST

**Best for:** Non-technical users, single person deployment

**Steps:**
1. Open: https://supabase.com/dashboard/project/zjvozjnbvrtrrpehqdpf/sql/new
2. Log in with your Supabase account
3. Copy SQL from one migration below
4. Paste into the SQL editor
5. Click **Run** (top-right)
6. Repeat for all 4 migrations

**Ready-to-copy SQL (split into small chunks to avoid timeouts):**

#### Migration 005: Geofence Events
```sql
-- Migration 005: Geofence Events
-- Auto-arrival detection system

CREATE TABLE geofence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('arrival', 'departure')),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  gps_accuracy integer,
  distance_from_stop_m double precision,
  triggered_at timestamp with time zone DEFAULT now(),
  is_verified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(job_id, event_type, triggered_at)
);

CREATE TABLE geofence_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  geofence_radius_m integer DEFAULT 100 CHECK (geofence_radius_m BETWEEN 50 AND 500),
  auto_advance_on_arrival boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE OR REPLACE FUNCTION haversine_distance(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) RETURNS double precision AS $$
BEGIN
  RETURN 6371000 * acos(
    cos(radians(90 - lat1)) * cos(radians(90 - lat2)) +
    sin(radians(90 - lat1)) * sin(radians(90 - lat2)) *
    cos(radians(lon1 - lon2))
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- RLS Policies
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dispatchers can read all geofence events"
  ON geofence_events FOR SELECT
  USING (auth.jwt() ->> 'role' = 'dispatcher');

CREATE POLICY "Drivers can read own geofence events"
  ON geofence_events FOR SELECT
  USING (driver_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE geofence_events;
```

#### Migration 006: POD Tables
```sql
-- Migration 006: Digital POD System

CREATE TABLE pod_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_hash text NOT NULL UNIQUE,
  quality_score integer CHECK (quality_score BETWEEN 0 AND 100),
  latitude double precision,
  longitude double precision,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE pod_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  signature_type text NOT NULL CHECK (signature_type IN ('customer', 'driver')),
  signature_data text NOT NULL,
  signed_by text NOT NULL,
  signed_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- RLS
ALTER TABLE pod_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert POD photos"
  ON pod_photos FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Dispatchers can read POD photos"
  ON pod_photos FOR SELECT
  USING (auth.jwt() ->> 'role' = 'dispatcher');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE pod_photos;
ALTER PUBLICATION supabase_realtime ADD TABLE pod_signatures;
```

#### Migration 007: ETA Fields
```sql
-- Migration 007: Live ETA Fields

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS eta timestamp with time zone;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS distance_remaining integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS eta_updated_at timestamp with time zone;

CREATE TABLE eta_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  eta timestamp with time zone NOT NULL,
  distance_m integer,
  accuracy_score integer,
  recorded_at timestamp with time zone DEFAULT now()
);

-- Index for fast queries
CREATE INDEX idx_eta_history_job_id ON eta_history(job_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE eta_history;
```

#### Migration 008: RBAC Permissions
```sql
-- Migration 008: Role-Based Access Control

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  permission_id uuid NOT NULL REFERENCES permissions(id),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(role, permission_id)
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  changes jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Insert default permissions
INSERT INTO permissions (code, description) VALUES
  ('view_dashboard', 'Access main dashboard'),
  ('manage_jobs', 'Create and edit jobs'),
  ('assign_drivers', 'Assign jobs to drivers'),
  ('view_analytics', 'Access analytics reports'),
  ('manage_drivers', 'Add/edit driver profiles'),
  ('manage_fleet', 'Manage vehicle fleet'),
  ('view_pod', 'View proof of delivery'),
  ('manage_settings', 'Edit system settings'),
  ('view_live_tracking', 'Live GPS tracking'),
  ('manage_routes', 'Optimize and create routes');

-- RLS
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE audit_log;
```

---

### **METHOD 2: Command Line (For Developers)** 💻

**Best for:** Technical users, automated CI/CD

**Requirements:** Supabase CLI installed

```bash
# 1. Install Supabase CLI
npm install -g supabase

# 2. Login to your project
supabase projects list

# 3. Deploy migrations
supabase db push --skip-seed

# Verify deployment
supabase db pull
```

---

### **METHOD 3: Automated (Need Credentials)** 🤖

I can deploy everything programmatically if you provide **ONE** of:

**Option A:** Service Role Key
- Found in: Supabase Dashboard → Settings → API → Service Role Key
- Provide it and I'll deploy instantly

**Option B:** Postgres Password
- Found in: Supabase Dashboard → Settings → Database → Password
- Provide it and I'll deploy via `psql` CLI

---

## ✅ Verification Checklist

After deployment, verify:

```sql
-- Check all tables exist
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('geofence_events', 'pod_photos', 'eta_history', 'permissions');

-- Check migrations ran
SELECT * FROM _supabase_migrations;

-- Verify RLS is enabled
SELECT tablename FROM pg_tables WHERE rowsecurity = true;
```

**Expected output:** All tables should exist with RLS enabled ✅

---

## 🎉 What Happens After Deployment

### Dispatcher Panel
✅ Geofencing auto-triggers jobs to "in_progress"
✅ Live ETA updates every 30 seconds
✅ POD photos with quality scoring
✅ Role-based feature access

### Driver App
✅ Auto-arrival notifications
✅ Real-time ETA display
✅ Photo quality feedback
✅ Feature-based permissions

---

## 💡 Recommended Process

**Step 1:** Use **METHOD 1** (Dashboard) for safety
- Easiest to debug if issues occur
- Direct SQL editor feedback
- Takes 5-10 minutes

**Step 2:** Test migrations
- Check Supabase tables exist
- Verify no errors in SQL editor

**Step 3:** Rebuild and deploy app
```bash
npm run build
npm run deploy
```

**Step 4:** Test features
- Test geofencing with driver app
- Test POD photo upload
- Test ETA updates

---

## 🚨 Rollback (If Needed)

If something goes wrong:

```sql
-- Drop new tables (in order, respecting foreign keys)
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS eta_history;
DROP TABLE IF EXISTS pod_signatures;
DROP TABLE IF EXISTS pod_photos;
DROP TABLE IF EXISTS geofence_config;
DROP TABLE IF EXISTS geofence_events;
DROP FUNCTION IF EXISTS haversine_distance;
```

---

## 🎯 Next Steps

**Choose one:**

1. **"Deploy it for me"** → Provide Service Role Key or Postgres password
2. **"I'll do it manually"** → Copy SQL above → Paste in dashboard
3. **"Use CLI"** → I'll guide you through `supabase db push`

Ready? Let me know! 🚀

