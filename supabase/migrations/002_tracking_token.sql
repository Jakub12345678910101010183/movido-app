-- ============================================
-- Migration 002: Add tracking_token to jobs
-- For Live ETA tracking links (public, no auth)
-- ============================================

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS tracking_token TEXT UNIQUE;

-- Auto-generate tracking token on insert
CREATE OR REPLACE FUNCTION generate_tracking_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tracking_token IS NULL THEN
    NEW.tracking_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tracking_token
  BEFORE INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION generate_tracking_token();

-- Backfill existing jobs
UPDATE jobs SET tracking_token = encode(gen_random_bytes(16), 'hex')
  WHERE tracking_token IS NULL;

-- RLS: Allow public read access via tracking_token (no auth needed)
CREATE POLICY "Public tracking access"
  ON jobs FOR SELECT
  USING (tracking_token IS NOT NULL);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_jobs_tracking_token ON jobs(tracking_token);
