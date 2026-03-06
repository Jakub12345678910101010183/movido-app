-- ============================================
-- MOVIDO — FIX SCHEMA
-- Drops Manus-created tables and recreates with correct columns
-- matching the Movido v11 codebase exactly.
--
-- RUN THIS IN SUPABASE SQL EDITOR
-- WARNING: This will delete all existing data!
-- ============================================

-- Drop old tables (order matters due to foreign keys)
DROP TABLE IF EXISTS fleet_maintenance CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop old enums if they exist
DROP TYPE IF EXISTS vehicle_type CASCADE;
DROP TYPE IF EXISTS vehicle_status CASCADE;
DROP TYPE IF EXISTS driver_status CASCADE;
DROP TYPE IF EXISTS job_status CASCADE;
DROP TYPE IF EXISTS job_priority CASCADE;
DROP TYPE IF EXISTS pod_status CASCADE;
DROP TYPE IF EXISTS maintenance_type CASCADE;
DROP TYPE IF EXISTS maintenance_status CASCADE;
DROP TYPE IF EXISTS message_channel CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE vehicle_type AS ENUM ('hgv', 'lgv', 'van');
CREATE TYPE vehicle_status AS ENUM ('active', 'idle', 'maintenance', 'offline');
CREATE TYPE driver_status AS ENUM ('on_duty', 'available', 'off_duty', 'on_break');
CREATE TYPE job_status AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE job_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE pod_status AS ENUM ('pending', 'signed', 'photo', 'na');
CREATE TYPE maintenance_type AS ENUM ('service', 'mot', 'repair', 'inspection', 'tyre');
CREATE TYPE maintenance_status AS ENUM ('scheduled', 'overdue', 'completed', 'cancelled');
CREATE TYPE message_channel AS ENUM ('dispatch', 'driver', 'alert', 'system');

-- ============================================
-- USERS
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  name TEXT,
  role TEXT DEFAULT 'dispatcher',
  avatar_url TEXT,
  subscription_plan TEXT DEFAULT 'starter',
  subscription_status TEXT DEFAULT 'trial',
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_signed_in TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- VEHICLES
-- ============================================
CREATE TABLE vehicles (
  id SERIAL PRIMARY KEY,
  vehicle_id TEXT NOT NULL UNIQUE,
  type vehicle_type DEFAULT 'hgv',
  make TEXT,
  model TEXT,
  registration TEXT,
  status vehicle_status DEFAULT 'active',
  height NUMERIC(4,2),
  width NUMERIC(4,2),
  weight NUMERIC(6,2),
  length NUMERIC(4,2),
  current_location TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  fuel_level INTEGER DEFAULT 100,
  mileage INTEGER DEFAULT 0,
  next_service_date DATE,
  driver_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- DRIVERS
-- ============================================
CREATE TABLE drivers (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  status driver_status DEFAULT 'available',
  license_type TEXT DEFAULT 'C+E',
  license_expiry DATE,
  hours_today NUMERIC(4,1) DEFAULT 0,
  hours_week NUMERIC(5,1) DEFAULT 0,
  rating NUMERIC(2,1) DEFAULT 5.0,
  total_deliveries INTEGER DEFAULT 0,
  vehicle_id INTEGER REFERENCES vehicles(id),
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- JOBS
-- ============================================
CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  status job_status DEFAULT 'pending',
  priority job_priority DEFAULT 'medium',
  pickup_address TEXT,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  delivery_address TEXT,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  scheduled_date DATE,
  eta TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  pod_status pod_status DEFAULT 'pending',
  pod_signature TEXT,
  pod_photo_url TEXT,
  pod_notes TEXT,
  tracking_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  vehicle_id INTEGER REFERENCES vehicles(id),
  driver_id INTEGER REFERENCES drivers(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- MESSAGES
-- ============================================
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  sender_id TEXT NOT NULL,
  recipient_id TEXT,
  channel message_channel DEFAULT 'dispatch',
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- FLEET MAINTENANCE
-- ============================================
CREATE TABLE fleet_maintenance (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  type maintenance_type NOT NULL,
  description TEXT,
  scheduled_date DATE NOT NULL,
  completed_date DATE,
  cost NUMERIC(10,2),
  status maintenance_status DEFAULT 'scheduled',
  mileage_at_service INTEGER,
  next_due_mileage INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_maintenance ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can do everything
CREATE POLICY "Authenticated read" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated update own" ON users FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Authenticated read" ON vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON vehicles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON vehicles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete" ON vehicles FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read" ON drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON drivers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON drivers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete" ON drivers FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read" ON jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon read tracking" ON jobs FOR SELECT TO anon USING (tracking_token IS NOT NULL);
CREATE POLICY "Authenticated insert" ON jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON jobs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete" ON jobs FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read" ON messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON messages FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated read" ON fleet_maintenance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON fleet_maintenance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON fleet_maintenance FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete" ON fleet_maintenance FOR DELETE TO authenticated USING (true);

-- ============================================
-- ENABLE REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE fleet_maintenance;

-- ============================================
-- DONE! Now run 002_seed_data.sql
-- ============================================
