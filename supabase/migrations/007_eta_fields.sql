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
