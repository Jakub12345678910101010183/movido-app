-- Movido Migration 006 — New driver app features
-- Run in Supabase SQL Editor

-- 1. Push notification token on drivers
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS push_token TEXT;

-- 2. Driver notes on jobs (notes left by driver at delivery)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS driver_notes TEXT;

-- 3. Multi-stop support on jobs (array of stop objects)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stops JSONB DEFAULT '[]'::jsonb;

-- 4. Customer phone on jobs (for click-to-call)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- 5. Fuel logs table
CREATE TABLE IF NOT EXISTS fuel_logs (
  id          SERIAL PRIMARY KEY,
  driver_id   INTEGER REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id  INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  fuel_amount DECIMAL(8,2) NOT NULL,
  fuel_cost   DECIMAL(8,2),
  fuel_type   TEXT DEFAULT 'diesel',
  mileage     INTEGER,
  station_name TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Incidents table
CREATE TABLE IF NOT EXISTS incidents (
  id                    SERIAL PRIMARY KEY,
  driver_id             INTEGER REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id            INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  job_id                INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  incident_type         TEXT NOT NULL CHECK (incident_type IN ('accident','near_miss','theft','vehicle_damage','load_damage','other')),
  description           TEXT,
  location_lat          DOUBLE PRECISION,
  location_lng          DOUBLE PRECISION,
  location_address      TEXT,
  photos                JSONB DEFAULT '[]'::jsonb,
  third_party_involved  BOOLEAN DEFAULT FALSE,
  reported_to_police    BOOLEAN DEFAULT FALSE,
  police_reference      TEXT,
  status                TEXT DEFAULT 'reported' CHECK (status IN ('reported','investigating','closed')),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 7. RLS on new tables
ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drivers_own_fuel_logs" ON fuel_logs
  FOR ALL USING (
    driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid())
  );

CREATE POLICY "dispatchers_see_fuel_logs" ON fuel_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  );

CREATE POLICY "drivers_own_incidents" ON incidents
  FOR ALL USING (
    driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid())
  );

CREATE POLICY "dispatchers_see_incidents" ON incidents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  );

-- 8. Updated_at trigger for incidents
CREATE TRIGGER incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Enable Realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE fuel_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
