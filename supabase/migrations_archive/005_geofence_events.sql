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
