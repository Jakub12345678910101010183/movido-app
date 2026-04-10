# 🚀 Supabase Deployment Guide - Migrations 005-008

**Date:** March 28, 2026
**Status:** Ready to Deploy
**Environment:** Supabase Cloud Dashboard

---

## 📋 What You're Deploying

4 database migrations that implement the core features for Movido v12:

| Migration | Feature | Tables Created | Lines |
|-----------|---------|-----------------|-------|
| **005_geofence_events.sql** | Event-Driven Geofencing | geofence_events, geofence_config | 220 |
| **006_pod_tables.sql** | Digital POD System | pod_photos, pod_signatures | 192 |
| **007_eta_fields.sql** | Real-time ETA | eta_history + jobs columns | 100 |
| **008_rbac_permissions.sql** | RBAC Permission Matrix | permissions, role_permissions, audit_log | 231 |

**Total:** 7 new tables, 15+ RLS policies, 8 PL/pgSQL functions, 5 database triggers

---

## 🔐 Pre-Deployment Checklist

- [ ] You have a Supabase account at https://supabase.com
- [ ] You have access to your **movido** project
- [ ] You can navigate to **SQL Editor** in the Supabase dashboard
- [ ] You have read/write access to the project database

---

## 🎯 Deployment Steps

### Step 1: Open Supabase Dashboard

1. Go to **https://supabase.com/dashboard**
2. Sign in with your account credentials
3. Click on your **movido** project
4. Navigate to **SQL Editor** in the left sidebar (looks like `<>`  icon)

### Step 2: Execute Migration 005 (Geofence Events)

This creates the event-driven geofencing system with real-time arrival detection.

1. In SQL Editor, create a new query (click **"New Query"** button)
2. Copy the entire content of **005_geofence_events.sql** (see "SQL Scripts" section below)
3. Paste into the editor
4. Click **"Run"** button (or Cmd+Enter)
5. Wait for success message: `✅ Query successful`

**What gets created:**
- `geofence_events` table - Logs arrival/departure events with GPS coords
- `geofence_config` table - Customizable radius (50-500m) per job
- `is_within_geofence()` function - Haversine distance calculation
- `handle_geofence_trigger()` function - Auto-detects arrivals
- Trigger on `drivers` table - Fires when driver location updates
- RLS policies - Dispatcher/driver access control

**Verify success:**
- In Supabase Studio → Tables, you should see:
  - ✅ `geofence_events`
  - ✅ `geofence_config`
- In Supabase Studio → Functions, you should see:
  - ✅ `is_within_geofence`
  - ✅ `handle_geofence_trigger`

---

### Step 3: Execute Migration 006 (Digital POD)

This creates the complete Proof of Delivery system with metadata separation.

1. Create another new query in SQL Editor
2. Copy the entire content of **006_pod_tables.sql** (see below)
3. Paste and **Run**
4. Verify success message

**What gets created:**
- `pod_photos` table - Photo metadata (GPS, quality_score, file_hash SHA-256)
- `pod_signatures` table - Customer/driver signatures with verification
- `update_job_pod_status()` function - Auto-updates job status based on POD state
- Triggers on both tables - Updates job pod_status when photos/signatures added
- RLS policies - Drivers manage own POD, dispatchers view all

**Verify success:**
- In Supabase Studio → Tables:
  - ✅ `pod_photos`
  - ✅ `pod_signatures`
- In Supabase Studio → Functions:
  - ✅ `update_job_pod_status`

---

### Step 4: Execute Migration 007 (Live ETA)

This adds real-time ETA calculation support with traffic-aware routing.

1. Create another new query
2. Copy entire content of **007_eta_fields.sql** (see below)
3. Paste and **Run**

**What gets created:**
- New columns on `jobs` table: `eta`, `distance_remaining`, `eta_updated_at`, `eta_accuracy`
- `eta_history` table - Tracks estimated vs actual arrival for accuracy analysis
- `calculate_eta_accuracy()` function - Determines accuracy level based on distance
- `log_eta_calculation()` function - Records ETA calculations
- `calculate_eta_error()` function - Computes error when job completes
- Trigger on `jobs` table - Logs ETA error on completion
- Indexes for performance - On eta, distance, status fields

**Verify success:**
- In Supabase Studio → Tables → jobs → Columns:
  - ✅ `eta` (timestamptz)
  - ✅ `distance_remaining` (double precision)
  - ✅ `eta_updated_at` (timestamptz)
  - ✅ `eta_accuracy` (text)
- New table:
  - ✅ `eta_history`

---

### Step 5: Execute Migration 008 (RBAC Permission System)

This implements fine-grained role-based access control.

1. Create final new query
2. Copy entire content of **008_rbac_permissions.sql** (see below)
3. Paste and **Run**

**What gets created:**
- `permissions` table - 25+ permission codes (jobs.*, drivers.*, admin.*, etc.)
- `role_permissions` table - Maps roles to permissions
- `audit_log` table - Tracks all permission changes and admin actions
- `user_has_permission()` function - Helper for RLS policies (returns boolean)
- `log_audit()` function - Records audit events
- `log_role_change()` function - Auto-logs when user role changes
- Trigger on `users` table - Logs role assignments
- RLS policies - Admins only view audit log
- Pre-seeded permissions - Standard permissions for DRIVER, DISPATCHER, ADMIN roles

**Verify success:**
- In Supabase Studio → Tables:
  - ✅ `permissions`
  - ✅ `role_permissions`
  - ✅ `audit_log`
- In Supabase Studio → Functions:
  - ✅ `user_has_permission`
  - ✅ `log_audit`
  - ✅ `log_role_change`

---

## ✅ Final Verification

After all 4 migrations run successfully:

1. **Check Tables:**
   - Supabase Studio → Tables tab
   - You should see all 7 new tables:
     - geofence_events
     - geofence_config
     - pod_photos
     - pod_signatures
     - eta_history
     - permissions
     - role_permissions
     - audit_log

2. **Check Functions:**
   - Supabase Studio → Functions tab
   - Verify 8 functions exist:
     - is_within_geofence
     - handle_geofence_trigger
     - update_job_pod_status
     - calculate_eta_accuracy
     - log_eta_calculation
     - calculate_eta_error
     - user_has_permission
     - log_audit
     - log_role_change

3. **Check Triggers:**
   - Supabase Studio → Database → Triggers
   - Verify 5 triggers:
     - geofence_trigger (on drivers table)
     - update_pod_status_photo (on pod_photos)
     - update_pod_status_signature (on pod_signatures)
     - calculate_eta_error_trigger (on jobs)
     - log_role_change_trigger (on users)

4. **Test a Geofence Event:**
   ```sql
   -- In SQL Editor, run this to verify geofence_events table exists:
   SELECT * FROM geofence_events LIMIT 1;
   -- Should return: 0 rows, no error
   ```

5. **Test Permission Matrix:**
   ```sql
   -- Check that standard permissions were seeded:
   SELECT COUNT(*) FROM permissions;
   -- Should return: 25 (or similar number)

   -- Check DRIVER role permissions:
   SELECT p.code FROM permissions p
   JOIN role_permissions rp ON p.id = rp.permission_id
   WHERE rp.role = 'driver';
   -- Should return: jobs.view_own, pod.capture, messages.send
   ```

---

## 🔄 Real-time Subscriptions

The following tables are already enabled for real-time via Supabase:

- ✅ `geofence_events` - Dispatcher sees arrival notifications instantly
- ✅ `pod_photos` - Driver app sees photo progress updates
- ✅ `pod_signatures` - Signature verification updates
- ✅ `audit_log` - Admin sees permission changes live

No additional configuration needed.

---

## 🛡️ Row-Level Security (RLS) Overview

All new tables have RLS policies enabled:

**geofence_events:**
- Dispatchers/admins view all events
- Drivers view their own events

**pod_photos & pod_signatures:**
- Drivers capture and manage own POD
- Dispatchers view all POD
- System automatically updates pod_status on insert

**permissions & role_permissions:**
- Only admin/dispatcher can view
- Prevents role enumeration from non-admins

**audit_log:**
- Only admins can view
- Tracks who changed what when

---

## 📁 SQL Scripts

### Migration 005: Geofence Events System

```sql
-- ============================================
-- Migration 005: Geofence Events System
-- For event-driven arrival detection & audit
-- ============================================

-- Create geofence_events table
CREATE TABLE IF NOT EXISTS geofence_events (
  id BIGSERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('pickup_arrival', 'delivery_arrival')),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  gps_accuracy DOUBLE PRECISION,
  status_before TEXT,
  status_after TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate events: same job+event within 5 minutes
  UNIQUE(job_id, event_type,
    DATE_TRUNC('minute'::text, triggered_at)::integer / 5
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_geofence_job ON geofence_events(job_id);
CREATE INDEX IF NOT EXISTS idx_geofence_driver ON geofence_events(driver_id);
CREATE INDEX IF NOT EXISTS idx_geofence_triggered ON geofence_events(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_geofence_event_type ON geofence_events(event_type);

-- Enable realtime for geofence events
ALTER PUBLICATION supabase_realtime ADD TABLE geofence_events;

-- RLS Policies
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;

-- Dispatchers/admins can view all geofence events
CREATE POLICY "Dispatchers view geofence events"
  ON geofence_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
    )
  );

-- Drivers can view their own geofence events
CREATE POLICY "Drivers view own geofence events"
  ON geofence_events FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM drivers
      WHERE user_id = auth.uid()
    )
  );

-- Allow system (via trigger) to insert geofence events
CREATE POLICY "System insert geofence events"
  ON geofence_events FOR INSERT
  WITH CHECK (true);

-- Geofence configuration (default radius: 200m)
CREATE TABLE IF NOT EXISTS geofence_config (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE UNIQUE,
  pickup_radius_meters INTEGER NOT NULL DEFAULT 200 CHECK (pickup_radius_meters >= 50 AND pickup_radius_meters <= 500),
  delivery_radius_meters INTEGER NOT NULL DEFAULT 200 CHECK (delivery_radius_meters >= 50 AND delivery_radius_meters <= 500),
  min_gps_accuracy_meters INTEGER NOT NULL DEFAULT 30,
  auto_advance_pickup BOOLEAN DEFAULT true,
  auto_advance_delivery BOOLEAN DEFAULT false, -- Require POD first
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for geofence config
ALTER TABLE geofence_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View geofence config"
  ON geofence_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
    )
  );

CREATE POLICY "Update geofence config"
  ON geofence_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
    )
  );

-- Function to check if driver is within geofence
CREATE OR REPLACE FUNCTION is_within_geofence(
  driver_lat DOUBLE PRECISION,
  driver_lng DOUBLE PRECISION,
  target_lat DOUBLE PRECISION,
  target_lng DOUBLE PRECISION,
  radius_meters INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  distance_m DOUBLE PRECISION;
  R CONSTANT DOUBLE PRECISION := 6371000; -- Earth radius in meters
BEGIN
  -- Haversine formula
  distance_m := R * 2 * ASIN(
    SQRT(
      POW(SIN(RADIANS(target_lat - driver_lat) / 2), 2) +
      COS(RADIANS(driver_lat)) * COS(RADIANS(target_lat)) *
      POW(SIN(RADIANS(target_lng - driver_lng) / 2), 2)
    )
  );

  RETURN distance_m <= radius_meters;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to handle geofence events
CREATE OR REPLACE FUNCTION handle_geofence_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_job jobs%ROWTYPE;
  v_config geofence_config%ROWTYPE;
  v_radius INTEGER;
  v_within_pickup BOOLEAN;
  v_within_delivery BOOLEAN;
  v_event_type TEXT;
  v_new_status TEXT;
BEGIN
  -- Only process when driver location updates
  IF TG_TABLE_NAME = 'drivers' AND (NEW.location_lat IS DISTINCT FROM OLD.location_lat OR NEW.location_lng IS DISTINCT FROM OLD.location_lng) THEN

    -- Get active jobs for this driver
    FOR v_job IN
      SELECT * FROM jobs
      WHERE driver_id = NEW.id
      AND status IN ('assigned', 'in_progress')
      AND pickup_lat IS NOT NULL
      AND pickup_lng IS NOT NULL
      AND delivery_lat IS NOT NULL
      AND delivery_lng IS NOT NULL
    LOOP

      -- Get geofence config (or defaults)
      SELECT * INTO v_config FROM geofence_config WHERE job_id = v_job.id;
      IF NOT FOUND THEN
        v_config.pickup_radius_meters := 200;
        v_config.delivery_radius_meters := 200;
        v_config.min_gps_accuracy_meters := 30;
        v_config.auto_advance_pickup := true;
        v_config.auto_advance_delivery := false;
      END IF;

      -- Skip if GPS accuracy is poor
      IF (NEW.gps_accuracy > v_config.min_gps_accuracy_meters) THEN
        CONTINUE;
      END IF;

      -- Check pickup geofence
      v_within_pickup := is_within_geofence(
        NEW.location_lat, NEW.location_lng,
        v_job.pickup_lat, v_job.pickup_lng,
        v_config.pickup_radius_meters
      );

      -- Check delivery geofence
      v_within_delivery := is_within_geofence(
        NEW.location_lat, NEW.location_lng,
        v_job.delivery_lat, v_job.delivery_lng,
        v_config.delivery_radius_meters
      );

      -- Handle pickup arrival
      IF v_within_pickup AND v_job.status = 'assigned' THEN
        -- Log event
        INSERT INTO geofence_events (job_id, driver_id, event_type, location_lat, location_lng, gps_accuracy, status_before, status_after)
        VALUES (v_job.id, NEW.id, 'pickup_arrival', NEW.location_lat, NEW.location_lng, NEW.gps_accuracy, v_job.status, 'in_progress')
        ON CONFLICT DO NOTHING;

        -- Auto-advance if enabled
        IF v_config.auto_advance_pickup THEN
          UPDATE jobs SET status = 'in_progress', updated_at = NOW() WHERE id = v_job.id;
        END IF;
      END IF;

      -- Handle delivery arrival
      IF v_within_delivery AND v_job.status = 'in_progress' THEN
        -- Log event
        INSERT INTO geofence_events (job_id, driver_id, event_type, location_lat, location_lng, gps_accuracy, status_before, status_after)
        VALUES (v_job.id, NEW.id, 'delivery_arrival', NEW.location_lat, NEW.location_lng, NEW.gps_accuracy, v_job.status, 'completed')
        ON CONFLICT DO NOTHING;

        -- Auto-advance if enabled (usually disabled, requires POD)
        IF v_config.auto_advance_delivery THEN
          UPDATE jobs SET status = 'completed', updated_at = NOW() WHERE id = v_job.id;
        END IF;
      END IF;

    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to drivers table
DROP TRIGGER IF EXISTS geofence_trigger ON drivers;
CREATE TRIGGER geofence_trigger
  AFTER UPDATE ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION handle_geofence_trigger();
```

### Migration 006: Digital POD System Tables

```sql
-- ============================================
-- Migration 006: Digital POD System Tables
-- For proof of delivery photos & signatures
-- ============================================

-- POD Photos table
CREATE TABLE IF NOT EXISTS pod_photos (
  id BIGSERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE SET NULL,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('delivery_proof', 'damage_report', 'vehicle_check', 'receipt', 'other')),
  storage_path TEXT NOT NULL UNIQUE, -- path in Supabase Storage: "pod/{jobRef}/{timestamp}.jpg"
  file_size INTEGER,
  image_width INTEGER,
  image_height INTEGER,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  gps_accuracy DOUBLE PRECISION,
  file_hash VARCHAR(64), -- SHA-256 hash for integrity verification
  quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
  metadata JSONB, -- { camera_model, phone_os, phone_model, app_version }
  captured_at TIMESTAMPTZ NOT NULL,
  s3_path TEXT, -- Optional: S3 backup path
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pod_photos_job ON pod_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_pod_photos_driver ON pod_photos(driver_id);
CREATE INDEX IF NOT EXISTS idx_pod_photos_type ON pod_photos(photo_type);
CREATE INDEX IF NOT EXISTS idx_pod_photos_created ON pod_photos(created_at DESC);

-- POD Signatures table
CREATE TABLE IF NOT EXISTS pod_signatures (
  id BIGSERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE SET NULL,
  signer_name VARCHAR(255) NOT NULL,
  signer_phone VARCHAR(32),
  signer_email VARCHAR(255),
  is_customer_signature BOOLEAN DEFAULT TRUE, -- true = customer, false = driver
  signature_data_url TEXT, -- Canvas data URL (kept for backward compat)
  signature_png_path TEXT, -- Path in Supabase Storage
  signature_s3_path TEXT, -- Optional: S3 backup path
  file_hash VARCHAR(64), -- SHA-256 hash
  signed_at TIMESTAMPTZ NOT NULL,
  verified_by_driver UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verification_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pod_signatures_job ON pod_signatures(job_id);
CREATE INDEX IF NOT EXISTS idx_pod_signatures_driver ON pod_signatures(driver_id);
CREATE INDEX IF NOT EXISTS idx_pod_signatures_signed ON pod_signatures(signed_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE pod_photos;
ALTER PUBLICATION supabase_realtime ADD TABLE pod_signatures;

-- RLS Policies for POD Photos
ALTER TABLE pod_photos ENABLE ROW LEVEL SECURITY;

-- Drivers can view own photos
CREATE POLICY "Drivers view own pod photos"
  ON pod_photos FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Dispatchers/admins view all
CREATE POLICY "Dispatchers view all pod photos"
  ON pod_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
    )
  );

-- Drivers insert own photos
CREATE POLICY "Drivers insert pod photos"
  ON pod_photos FOR INSERT
  WITH CHECK (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Drivers update own photos
CREATE POLICY "Drivers update pod photos"
  ON pod_photos FOR UPDATE
  USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Dispatchers update (for quality review, s3_path sync)
CREATE POLICY "Dispatchers update pod photos"
  ON pod_photos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
    )
  );

-- RLS Policies for POD Signatures
ALTER TABLE pod_signatures ENABLE ROW LEVEL SECURITY;

-- Drivers view own signatures
CREATE POLICY "Drivers view own signatures"
  ON pod_signatures FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Dispatchers view all
CREATE POLICY "Dispatchers view all signatures"
  ON pod_signatures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
    )
  );

-- Drivers insert signatures
CREATE POLICY "Drivers insert signatures"
  ON pod_signatures FOR INSERT
  WITH CHECK (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Drivers update own signatures
CREATE POLICY "Drivers update own signatures"
  ON pod_signatures FOR UPDATE
  USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Function to update job POD status based on photos + signatures
CREATE OR REPLACE FUNCTION update_job_pod_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Determine pod_status based on available photos and signatures
  UPDATE jobs
  SET pod_status = CASE
    WHEN EXISTS(SELECT 1 FROM pod_photos WHERE job_id = NEW.job_id)
         AND EXISTS(SELECT 1 FROM pod_signatures WHERE job_id = NEW.job_id)
      THEN 'photo_and_signed'::pod_status
    WHEN EXISTS(SELECT 1 FROM pod_signatures WHERE job_id = NEW.job_id)
      THEN 'signed'::pod_status
    WHEN EXISTS(SELECT 1 FROM pod_photos WHERE job_id = NEW.job_id)
      THEN 'photo'::pod_status
    ELSE pod_status
  END,
  updated_at = NOW()
  WHERE id = NEW.job_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on photo insert
DROP TRIGGER IF EXISTS update_pod_status_photo ON pod_photos;
CREATE TRIGGER update_pod_status_photo
  AFTER INSERT ON pod_photos
  FOR EACH ROW
  EXECUTE FUNCTION update_job_pod_status();

-- Trigger on signature insert
DROP TRIGGER IF EXISTS update_pod_status_signature ON pod_signatures;
CREATE TRIGGER update_pod_status_signature
  AFTER INSERT ON pod_signatures
  FOR EACH ROW
  EXECUTE FUNCTION update_job_pod_status();
```

### Migration 007: Live ETA Fields

```sql
-- ============================================
-- Migration 007: Live ETA Fields
-- For real-time arrival time calculations
-- ============================================

-- Add ETA fields to jobs table
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS eta TIMESTAMPTZ, -- Estimated time of arrival
  ADD COLUMN IF NOT EXISTS distance_remaining DOUBLE PRECISION, -- meters
  ADD COLUMN IF NOT EXISTS eta_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eta_accuracy TEXT CHECK (eta_accuracy IN ('high', 'medium', 'low')); -- ±5min, ±15min, >±15min

-- Create ETA history table for trend analysis
CREATE TABLE IF NOT EXISTS eta_history (
  id BIGSERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  eta_calculated TIMESTAMPTZ NOT NULL,
  eta_actual TIMESTAMPTZ, -- Actual arrival (filled after job completed)
  eta_error_seconds INTEGER, -- Difference: (actual - calculated)
  distance_meters DOUBLE PRECISION,
  route_distance_meters DOUBLE PRECISION, -- TomTom returned distance
  traffic_factor DOUBLE PRECISION, -- 1.0 = no traffic delay
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eta_job ON eta_history(job_id);
CREATE INDEX IF NOT EXISTS idx_eta_driver ON eta_history(driver_id);
CREATE INDEX IF NOT EXISTS idx_eta_recorded ON eta_history(recorded_at DESC);

-- Enable realtime for jobs (already enabled, but ensure eta fields are included)
-- ALTER PUBLICATION supabase_realtime ADD TABLE jobs; -- Already done in migration 001

-- Function to calculate ETA deviation accuracy
CREATE OR REPLACE FUNCTION calculate_eta_accuracy(
  distance_meters DOUBLE PRECISION,
  eta_seconds INTEGER
)
RETURNS TEXT AS $$
BEGIN
  -- Simple model: estimate ±15min per 50km
  -- Can be improved with traffic data and historical data
  IF distance_meters < 10000 THEN -- < 10km
    RETURN 'high'; -- ±5 minutes
  ELSIF distance_meters < 50000 THEN -- < 50km
    RETURN 'medium'; -- ±15 minutes
  ELSE
    RETURN 'low'; -- >±15 minutes
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to log ETA calculation
CREATE OR REPLACE FUNCTION log_eta_calculation(
  p_job_id INTEGER,
  p_driver_id INTEGER,
  p_eta_calculated TIMESTAMPTZ,
  p_distance_meters DOUBLE PRECISION,
  p_route_distance_meters DOUBLE PRECISION DEFAULT NULL,
  p_traffic_factor DOUBLE PRECISION DEFAULT 1.0
)
RETURNS void AS $$
BEGIN
  INSERT INTO eta_history (job_id, driver_id, eta_calculated, distance_meters, route_distance_meters, traffic_factor)
  VALUES (p_job_id, p_driver_id, p_eta_calculated, p_distance_meters, p_route_distance_meters, p_traffic_factor);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate actual ETA error when job completes
CREATE OR REPLACE FUNCTION calculate_eta_error()
RETURNS TRIGGER AS $$
BEGIN
  -- When job marked as completed, calculate ETA accuracy
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE eta_history
    SET eta_actual = NOW(),
        eta_error_seconds = EXTRACT(EPOCH FROM (NOW() - eta_calculated))::INTEGER
    WHERE job_id = NEW.id
    AND eta_actual IS NULL
    ORDER BY recorded_at DESC
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log ETA errors
DROP TRIGGER IF EXISTS calculate_eta_error_trigger ON jobs;
CREATE TRIGGER calculate_eta_error_trigger
  AFTER UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION calculate_eta_error();

-- Indexes on jobs table for ETA
CREATE INDEX IF NOT EXISTS idx_jobs_eta ON jobs(eta);
CREATE INDEX IF NOT EXISTS idx_jobs_eta_updated ON jobs(eta_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_eta ON jobs(status, eta) WHERE eta IS NOT NULL;
```

### Migration 008: RBAC Permission System

```sql
-- ============================================
-- Migration 008: RBAC Permission System
-- For fine-grained role-based access control
-- ============================================

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE, -- e.g., "jobs.view", "jobs.create", "jobs.edit", "jobs.delete"
  description TEXT,
  category VARCHAR(32) NOT NULL CHECK (category IN ('jobs', 'drivers', 'vehicles', 'reports', 'admin', 'pod', 'messages')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role-permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role user_role NOT NULL,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, permission_id)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role user_role,
  action TEXT NOT NULL, -- 'ASSIGN_ROLE', 'UPDATE_PERMISSION', 'DELETE_USER', etc.
  resource_type VARCHAR(64), -- 'users', 'roles', 'jobs', etc.
  resource_id INTEGER,
  old_value TEXT,
  new_value TEXT,
  changes JSONB, -- { field: { from: old, to: new }, ... }
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE audit_log;

-- RLS for permissions
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View permissions"
  ON permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
    )
  );

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View role permissions"
  ON role_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
    )
  );

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view audit log"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- Helper function to check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(
  p_permission_code TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role user_role;
BEGIN
  -- Get user's role
  SELECT role INTO v_user_role FROM users WHERE id = auth.uid();

  -- Admin has all permissions
  IF v_user_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Check if permission exists for this role
  RETURN EXISTS (
    SELECT 1
    FROM role_permissions rp
    JOIN permissions p ON rp.permission_id = p.id
    WHERE rp.role = v_user_role
    AND p.code = p_permission_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to log audit event
CREATE OR REPLACE FUNCTION log_audit(
  p_action TEXT,
  p_resource_type VARCHAR(64),
  p_resource_id INTEGER DEFAULT NULL,
  p_old_value TEXT DEFAULT NULL,
  p_new_value TEXT DEFAULT NULL,
  p_changes JSONB DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO audit_log (user_id, actor_role, action, resource_type, resource_id, old_value, new_value, changes)
  SELECT
    auth.uid(),
    (SELECT role FROM users WHERE id = auth.uid()),
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_value,
    p_new_value,
    p_changes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Standard permissions to be seeded (run after migration)
INSERT INTO permissions (code, description, category) VALUES
  -- Jobs
  ('jobs.view', 'View all jobs', 'jobs'),
  ('jobs.view_own', 'View own assigned jobs', 'jobs'),
  ('jobs.create', 'Create new jobs', 'jobs'),
  ('jobs.edit', 'Edit job details', 'jobs'),
  ('jobs.delete', 'Delete jobs', 'jobs'),
  ('jobs.assign', 'Assign jobs to drivers', 'jobs'),

  -- Drivers
  ('drivers.view', 'View driver list and details', 'drivers'),
  ('drivers.create', 'Create new drivers', 'drivers'),
  ('drivers.edit', 'Edit driver details', 'drivers'),
  ('drivers.delete', 'Delete drivers', 'drivers'),

  -- Vehicles
  ('vehicles.view', 'View vehicle list', 'vehicles'),
  ('vehicles.create', 'Create new vehicles', 'vehicles'),
  ('vehicles.edit', 'Edit vehicle details', 'vehicles'),
  ('vehicles.delete', 'Delete vehicles', 'vehicles'),

  -- POD
  ('pod.view', 'View proof of delivery', 'pod'),
  ('pod.capture', 'Capture POD photos/signatures', 'pod'),
  ('pod.verify', 'Verify and approve POD', 'pod'),

  -- Messages
  ('messages.send', 'Send messages to drivers', 'messages'),
  ('messages.view', 'View message history', 'messages'),

  -- Reports
  ('reports.view', 'View reports and analytics', 'reports'),
  ('reports.export', 'Export reports', 'reports'),

  -- Admin
  ('admin.manage_users', 'Create/edit/delete users', 'admin'),
  ('admin.manage_roles', 'Assign roles to users', 'admin'),
  ('admin.view_audit', 'View audit log', 'admin'),
  ('admin.settings', 'Manage system settings', 'admin')
ON CONFLICT (code) DO NOTHING;

-- Seed default role permissions
-- DRIVER role
INSERT INTO role_permissions (role, permission_id)
SELECT 'driver', id FROM permissions WHERE code IN (
  'jobs.view_own',
  'pod.capture',
  'messages.send'
) ON CONFLICT (role, permission_id) DO NOTHING;

-- DISPATCHER role
INSERT INTO role_permissions (role, permission_id)
SELECT 'dispatcher', id FROM permissions WHERE code IN (
  'jobs.view',
  'jobs.create',
  'jobs.edit',
  'jobs.assign',
  'drivers.view',
  'vehicles.view',
  'pod.view',
  'pod.verify',
  'messages.send',
  'messages.view',
  'reports.view'
) ON CONFLICT (role, permission_id) DO NOTHING;

-- ADMIN role
INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', id FROM permissions
ON CONFLICT (role, permission_id) DO NOTHING;

-- Trigger to log user role changes
CREATE OR REPLACE FUNCTION log_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM log_audit(
      'ASSIGN_ROLE',
      'users',
      (SELECT id FROM users WHERE id = NEW.id LIMIT 1)::INTEGER,
      OLD.role::TEXT,
      NEW.role::TEXT,
      jsonb_build_object('role', jsonb_build_object('from', OLD.role::TEXT, 'to', NEW.role::TEXT))
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to users table (if not already done)
DROP TRIGGER IF EXISTS log_role_change_trigger ON users;
CREATE TRIGGER log_role_change_trigger
  AFTER UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION log_role_change();
```

---

## 🆘 Troubleshooting

### Error: "Table already exists"
**Solution:** This is normal if you're rerunning migrations. The `CREATE TABLE IF NOT EXISTS` clause prevents errors. You can safely run the migrations again.

### Error: "Column already exists"
**Solution:** Same as above. The `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is idempotent.

### Error: "Function already exists"
**Solution:** The migrations use `CREATE OR REPLACE FUNCTION`, which updates existing functions safely.

### Error: "Foreign key constraint failed"
**Solution:** Ensure your `jobs` and `drivers` tables exist (from initial migrations 001-004). If you get this error, check that previous migrations ran successfully.

### Error: "user_role type does not exist"
**Solution:** Ensure migration 001_initial_schema.sql ran successfully. The `user_role` enum should exist on the `users` table.

---

## ✨ Next Steps After Deployment

Once all 4 migrations are deployed successfully:

1. **Test Geofencing:**
   - Insert a test driver with location
   - Update driver location to trigger geofence
   - Check geofence_events table for logged event

2. **Test POD System:**
   - Call usePODCapture hook from driver app
   - Verify pod_photos and pod_signatures created

3. **Deploy Code:**
   - The React hooks and components are already built:
     - `/client/src/hooks/useGeofenceEvents.ts`
     - `/driver-app/src/hooks/usePODCapture.ts`
     - `/client/src/components/GeofenceCircle.tsx`
     - etc.
   - Build and deploy Movido v12 to your environment

4. **Continue with Phase 3:**
   - Build ETA hooks using the new `eta_history` table
   - Create customer tracking page
   - Implement RBAC UI (role management page)

---

## 📞 Support

For issues or questions:
1. Check Supabase Studio → Tables/Functions tabs
2. Verify RLS policies are active
3. Test query execution in SQL Editor
4. Check system logs for errors

---

**Status:** ✅ **Ready for Deployment**
**Created:** March 28, 2026
**By:** Claude Engineer (Haiku 4.5)
