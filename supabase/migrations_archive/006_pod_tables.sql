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
