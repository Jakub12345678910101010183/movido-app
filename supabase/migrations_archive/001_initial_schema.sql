-- ============================================
-- MOVIDO - Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor to create all tables
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('user', 'admin', 'dispatcher', 'driver');
CREATE TYPE vehicle_type AS ENUM ('hgv', 'lgv', 'van');
CREATE TYPE vehicle_status AS ENUM ('active', 'idle', 'maintenance', 'offline');
CREATE TYPE driver_status AS ENUM ('on_duty', 'available', 'off_duty', 'on_break');
CREATE TYPE job_status AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE job_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE pod_status AS ENUM ('pending', 'signed', 'photo', 'na');
CREATE TYPE message_channel AS ENUM ('dispatch', 'driver', 'alert', 'system');
CREATE TYPE maintenance_type AS ENUM ('service', 'mot', 'repair', 'inspection', 'tyre');
CREATE TYPE maintenance_status AS ENUM ('scheduled', 'overdue', 'completed', 'cancelled');

-- ============================================
-- USERS (linked to Supabase Auth)
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  role user_role NOT NULL DEFAULT 'user',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_signed_in TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- VEHICLES
-- ============================================

CREATE TABLE vehicles (
  id SERIAL PRIMARY KEY,
  vehicle_id VARCHAR(32) NOT NULL UNIQUE,  -- e.g. HGV-001
  type vehicle_type NOT NULL DEFAULT 'hgv',
  make VARCHAR(64),
  model VARCHAR(64),
  registration VARCHAR(16),
  status vehicle_status NOT NULL DEFAULT 'idle',
  -- Dimensions (metres)
  height DECIMAL(4,2),
  width DECIMAL(4,2),
  weight DECIMAL(5,2),   -- tonnes
  -- Location
  current_location VARCHAR(255),
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  -- State
  fuel_level INTEGER NOT NULL DEFAULT 100,
  mileage INTEGER NOT NULL DEFAULT 0,
  -- Maintenance
  next_service_date TIMESTAMPTZ,
  -- Relations
  driver_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- DRIVERS
-- ============================================

CREATE TABLE drivers (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(128) NOT NULL,
  email VARCHAR(320),
  phone VARCHAR(32),
  status driver_status NOT NULL DEFAULT 'available',
  -- Licence
  license_type VARCHAR(32),  -- e.g. Cat C+E (Artic)
  license_expiry TIMESTAMPTZ,
  -- Working hours
  hours_today DECIMAL(4,1) NOT NULL DEFAULT 0,
  hours_week DECIMAL(5,1) NOT NULL DEFAULT 0,
  -- Performance
  rating DECIMAL(2,1) NOT NULL DEFAULT 4.5,
  total_deliveries INTEGER NOT NULL DEFAULT 0,
  -- Assigned vehicle
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  -- Live GPS
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from vehicles back to drivers (circular)
ALTER TABLE vehicles ADD CONSTRAINT fk_vehicles_driver
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;

-- ============================================
-- JOBS
-- ============================================

CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(32) NOT NULL UNIQUE,  -- e.g. JOB-2026-001
  customer VARCHAR(128) NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  priority job_priority NOT NULL DEFAULT 'medium',
  -- Locations (with coordinates for map)
  pickup_address VARCHAR(255),
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  delivery_address VARCHAR(255),
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  -- Timing
  scheduled_date TIMESTAMPTZ,
  eta TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Proof of Delivery
  pod_status pod_status NOT NULL DEFAULT 'pending',
  pod_signature TEXT,
  pod_photo_url TEXT,
  pod_notes TEXT,
  -- Relations
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- MESSAGES (Internal Messenger)
-- ============================================

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  channel message_channel NOT NULL DEFAULT 'dispatch',
  content TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- FLEET MAINTENANCE
-- ============================================

CREATE TABLE fleet_maintenance (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type maintenance_type NOT NULL,
  description TEXT,
  scheduled_date TIMESTAMPTZ NOT NULL,
  completed_date TIMESTAMPTZ,
  cost DECIMAL(10,2),
  status maintenance_status NOT NULL DEFAULT 'scheduled',
  mileage_at_service INTEGER,
  next_due_mileage INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_driver ON vehicles(driver_id);
CREATE INDEX idx_drivers_status ON drivers(status);
CREATE INDEX idx_drivers_user ON drivers(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_driver ON jobs(driver_id);
CREATE INDEX idx_jobs_vehicle ON jobs(vehicle_id);
CREATE INDEX idx_jobs_scheduled ON jobs(scheduled_date);
CREATE INDEX idx_messages_recipient ON messages(recipient_id, read);
CREATE INDEX idx_messages_channel ON messages(channel);
CREATE INDEX idx_maintenance_vehicle ON fleet_maintenance(vehicle_id);
CREATE INDEX idx_maintenance_status ON fleet_maintenance(status);
CREATE INDEX idx_maintenance_date ON fleet_maintenance(scheduled_date);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vehicles_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER drivers_updated_at BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER maintenance_updated_at BEFORE UPDATE ON fleet_maintenance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_maintenance ENABLE ROW LEVEL SECURITY;

-- Users: can read own profile, admins can read all
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'dispatcher'))
  );

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Vehicles: authenticated users can read, dispatchers/admins can write
CREATE POLICY "Authenticated can view vehicles" ON vehicles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Dispatchers can manage vehicles" ON vehicles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'dispatcher'))
  );

-- Drivers: authenticated users can read, dispatchers/admins can write, drivers can update own location
CREATE POLICY "Authenticated can view drivers" ON drivers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Dispatchers can manage drivers" ON drivers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'dispatcher'))
  );

CREATE POLICY "Drivers can update own record" ON drivers
  FOR UPDATE USING (user_id = auth.uid());

-- Jobs: authenticated users can read, dispatchers can write
CREATE POLICY "Authenticated can view jobs" ON jobs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Dispatchers can manage jobs" ON jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'dispatcher'))
  );

-- Messages: users can read own messages
CREATE POLICY "Users can view own messages" ON messages
  FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can mark own messages read" ON messages
  FOR UPDATE USING (recipient_id = auth.uid());

-- Fleet Maintenance: authenticated users can read, dispatchers can write
CREATE POLICY "Authenticated can view maintenance" ON fleet_maintenance
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Dispatchers can manage maintenance" ON fleet_maintenance
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'dispatcher'))
  );

-- ============================================
-- ENABLE REALTIME
-- Run these in Supabase Dashboard > Database > Replication
-- or use the SQL below
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================
-- AUTO-CREATE USER PROFILE ON SIGN-UP
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
