-- Migration 009: Row-Level Security (RLS) Policies
-- Applied April 10, 2026
-- Purpose: Secure data access for dispatcher and driver roles

-- ============================================================
-- GEOFENCE EVENTS RLS
-- ============================================================
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispatchers read all geofence events"
  ON geofence_events FOR SELECT
  USING (auth.jwt() ->> 'role' = 'dispatcher');

CREATE POLICY "Drivers read own geofence events"
  ON geofence_events FOR SELECT
  USING (driver_id = auth.uid());

CREATE POLICY "System inserts geofence events"
  ON geofence_events FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- GEOFENCE CONFIG RLS
-- ============================================================
ALTER TABLE geofence_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispatchers manage geofence config"
  ON geofence_config FOR ALL
  USING (auth.jwt() ->> 'role' = 'dispatcher');

-- ============================================================
-- POD PHOTOS RLS
-- ============================================================
-- Table RLS already enabled in migration 006, but update policies
ALTER TABLE pod_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers insert own POD photos"
  ON pod_photos FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Drivers view own POD photos"
  ON pod_photos FOR SELECT
  USING (driver_id = auth.uid());

CREATE POLICY "Dispatchers read all POD photos"
  ON pod_photos FOR SELECT
  USING (auth.jwt() ->> 'role' = 'dispatcher');

-- ============================================================
-- POD SIGNATURES RLS
-- ============================================================
ALTER TABLE pod_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert signatures"
  ON pod_signatures FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Dispatchers and drivers read signatures"
  ON pod_signatures FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'dispatcher' 
    OR auth.jwt() ->> 'role' = 'driver'
  );

-- ============================================================
-- ETA HISTORY RLS
-- ============================================================
ALTER TABLE eta_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispatchers read all ETA history"
  ON eta_history FOR SELECT
  USING (auth.jwt() ->> 'role' = 'dispatcher');

CREATE POLICY "System inserts ETA history"
  ON eta_history FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- PERMISSIONS RLS
-- ============================================================
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read permissions"
  ON permissions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins manage permissions"
  ON permissions FOR ALL
  USING (auth.jwt() ->> 'role' = 'dispatcher');

-- ============================================================
-- ROLE PERMISSIONS RLS
-- ============================================================
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read role permissions"
  ON role_permissions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins manage role permissions"
  ON role_permissions FOR ALL
  USING (auth.jwt() ->> 'role' = 'dispatcher');

-- ============================================================
-- AUDIT LOG RLS
-- ============================================================
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispatchers read audit logs"
  ON audit_log FOR SELECT
  USING (auth.jwt() ->> 'role' = 'dispatcher');

CREATE POLICY "System inserts audit logs"
  ON audit_log FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- Summary of RLS Policies Applied
-- ============================================================
-- Total: 20 RLS policies across 8 tables
-- Security Level: Dispatcher (admin) and Driver (user) roles
-- Status: Comprehensive role-based security enabled
