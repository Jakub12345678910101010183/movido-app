-- ============================================
-- Movido Seed Data — Sample fleet for testing
-- Run this in Supabase SQL Editor AFTER migrations
-- ============================================

-- NOTE: You must first create a user in Supabase Auth (via Dashboard > Authentication)
-- Then insert that user's UUID below for the dispatcher profile.
-- Replace 'YOUR-AUTH-USER-UUID' with your actual Supabase Auth user ID.

-- ============================================
-- 1. DISPATCHER USER (update UUID after creating auth user)
-- ============================================
-- INSERT INTO users (id, email, full_name, role)
-- VALUES ('YOUR-AUTH-USER-UUID', 'dispatch@movido.com', 'Dispatch Admin', 'dispatcher');

-- ============================================
-- 2. VEHICLES (8 HGV/LGV fleet based in Northampton)
-- ============================================
INSERT INTO vehicles (vehicle_id, make, model, registration, type, status, fuel_level, mileage, height, weight, width, length) VALUES
  ('HGV-001', 'DAF', 'XF 530', 'ND23 HGV', 'hgv', 'active', 78, 124500, 4.0, 18.0, 2.55, 13.6),
  ('HGV-002', 'Volvo', 'FH16', 'ND22 VLV', 'hgv', 'active', 45, 198200, 4.0, 18.0, 2.55, 13.6),
  ('HGV-003', 'Scania', 'R450', 'ND24 SCN', 'hgv', 'active', 92, 67300, 4.0, 18.0, 2.55, 13.6),
  ('HGV-004', 'Mercedes', 'Actros 2545', 'ND21 MRC', 'hgv', 'maintenance', 33, 245100, 4.0, 18.0, 2.55, 13.6),
  ('HGV-005', 'MAN', 'TGX 18.510', 'ND23 MAN', 'hgv', 'active', 65, 156700, 4.0, 18.0, 2.55, 13.6),
  ('LGV-001', 'Mercedes', 'Sprinter 316', 'ND24 SPR', 'lgv', 'active', 55, 42300, 2.7, 3.5, 2.0, 7.0),
  ('LGV-002', 'Ford', 'Transit 350', 'ND22 FRD', 'lgv', 'active', 12, 87600, 2.5, 3.5, 2.0, 6.0),
  ('VAN-001', 'VW', 'Crafter', 'ND24 VWC', 'van', 'idle', 88, 23100, 2.3, 3.0, 1.9, 5.9);

-- ============================================
-- 3. DRIVERS (6 drivers, Northampton based)
-- ============================================
INSERT INTO drivers (name, email, phone, license_type, status, rating, hours_today, hours_week, total_deliveries) VALUES
  ('James Wilson', 'james@movido.com', '+44 7700 100001', 'C+E', 'on_duty', 4.8, 6.5, 38, 342),
  ('David Clarke', 'david@movido.com', '+44 7700 100002', 'C+E', 'available', 4.6, 0, 32, 287),
  ('Ryan Patel', 'ryan@movido.com', '+44 7700 100003', 'C+E', 'on_duty', 4.9, 7.2, 41, 415),
  ('Mark Thompson', 'mark@movido.com', '+44 7700 100004', 'C', 'off_duty', 4.5, 0, 28, 198),
  ('Chris Evans', 'chris@movido.com', '+44 7700 100005', 'C+E', 'on_break', 4.7, 4.0, 35, 310),
  ('Alex Morgan', 'alex@movido.com', '+44 7700 100006', 'C', 'available', 4.3, 0, 22, 156);

-- Assign vehicles to some drivers
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-001') WHERE name = 'James Wilson';
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-002') WHERE name = 'David Clarke';
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-003') WHERE name = 'Ryan Patel';
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-005') WHERE name = 'Chris Evans';
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'LGV-001') WHERE name = 'Mark Thompson';
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'LGV-002') WHERE name = 'Alex Morgan';

-- Set some driver locations (around Northampton)
UPDATE drivers SET location_lat = 52.2405, location_lng = -0.9027 WHERE name = 'James Wilson';
UPDATE drivers SET location_lat = 52.2310, location_lng = -0.8850 WHERE name = 'Ryan Patel';
UPDATE drivers SET location_lat = 52.2560, location_lng = -0.9150 WHERE name = 'Chris Evans';

-- ============================================
-- 4. JOBS (10 sample deliveries)
-- ============================================
INSERT INTO jobs (reference, customer, status, priority, driver_id, vehicle_id,
  pickup_address, pickup_lat, pickup_lng,
  delivery_address, delivery_lat, delivery_lng,
  pod_status, eta) VALUES

  ('JOB-2026-001', 'Tesco Distribution', 'in_progress', 'high',
   (SELECT id FROM drivers WHERE name = 'James Wilson'),
   (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-001'),
   'Brackmills Industrial Estate, Northampton, NN4 7PD', 52.2231, -0.8765,
   'Magna Park, Lutterworth, LE17 4XN', 52.4340, -1.1855,
   'pending', NOW() + INTERVAL '2 hours'),

  ('JOB-2026-002', 'Amazon FC MK1', 'in_progress', 'urgent',
   (SELECT id FROM drivers WHERE name = 'Ryan Patel'),
   (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-003'),
   'Moulton Park, Northampton, NN3 6AQ', 52.2600, -0.8810,
   'Amazon MK1, Ridgmont, MK43 0ZA', 52.0290, -0.5720,
   'pending', NOW() + INTERVAL '1 hour'),

  ('JOB-2026-003', 'B&Q Warehouse', 'assigned', 'medium',
   (SELECT id FROM drivers WHERE name = 'David Clarke'),
   (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-002'),
   'Swan Valley, Northampton, NN4 9BB', 52.2130, -0.9350,
   'B&Q DC, Worksop, S80 1UZ', 53.2960, -1.1330,
   'pending', NOW() + INTERVAL '4 hours'),

  ('JOB-2026-004', 'Royal Mail Depot', 'assigned', 'low',
   (SELECT id FROM drivers WHERE name = 'Chris Evans'),
   (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-005'),
   'Royal Mail MC, Northampton, NN1 1AA', 52.2366, -0.8976,
   'Royal Mail MC, Coventry, CV1 2QX', 52.4068, -1.5087,
   'pending', NOW() + INTERVAL '3 hours'),

  ('JOB-2026-005', 'Argos Distribution', 'pending', 'medium',
   NULL, NULL,
   'Pineham Business Park, Northampton, NN4 9EX', 52.2050, -0.9400,
   'Argos DC, Burton-on-Trent, DE14 2WE', 52.8020, -1.6340,
   'pending', NULL),

  ('JOB-2026-006', 'M&S Foodhall', 'pending', 'high',
   NULL, NULL,
   'Grange Park, Northampton, NN4 5EA', 52.2050, -0.9190,
   'M&S Castle Marina, Nottingham, NG7 1GX', 52.9440, -1.1620,
   'pending', NULL),

  ('JOB-2026-007', 'DHL Express', 'completed', 'medium',
   (SELECT id FROM drivers WHERE name = 'James Wilson'),
   (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-001'),
   'DHL Hub, East Midlands Airport, DE74 2TG', 52.8310, -1.3280,
   'Brackmills Industrial Estate, Northampton, NN4 7PD', 52.2231, -0.8765,
   'photo', NOW() - INTERVAL '3 hours'),

  ('JOB-2026-008', 'Howdens Joinery', 'completed', 'low',
   (SELECT id FROM drivers WHERE name = 'David Clarke'),
   (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-002'),
   'Howdens DC, Northampton, NN5 5JR', 52.2520, -0.9280,
   'Howdens Branch, Milton Keynes, MK9 1EA', 52.0406, -0.7594,
   'signed', NOW() - INTERVAL '5 hours'),

  ('JOB-2026-009', 'Screwfix Direct', 'pending', 'urgent',
   NULL, NULL,
   'Screwfix DC, Stoke-on-Trent, ST4 2RN', 52.9880, -2.1590,
   'Brackmills, Northampton, NN4 7PD', 52.2231, -0.8765,
   'pending', NULL),

  ('JOB-2026-010', 'John Lewis Partnership', 'in_progress', 'high',
   (SELECT id FROM drivers WHERE name = 'Alex Morgan'),
   (SELECT id FROM vehicles WHERE vehicle_id = 'LGV-002'),
   'Magna Park, Milton Keynes, MK17 8EW', 52.0100, -0.8050,
   'John Lewis, Leicester, LE1 4FQ', 52.6369, -1.1398,
   'pending', NOW() + INTERVAL '90 minutes');

-- ============================================
-- 5. MAINTENANCE (service records)
-- ============================================
INSERT INTO fleet_maintenance (vehicle_id, type, description, scheduled_date, completed_date, status, cost) VALUES
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-001'), 'oil_change', 'Regular 50k service oil change', '2026-02-01', '2026-02-01', 'completed', 280),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-001'), 'tyre_check', 'Steer axle tyre replacement', '2026-02-25', NULL, 'scheduled', 850),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-002'), 'full_service', '200k full service inspection', '2026-02-10', NULL, 'scheduled', 1450),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-003'), 'brake_inspection', 'Annual brake disc and pad check', '2026-01-15', '2026-01-15', 'completed', 420),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-004'), 'mot', 'Annual MOT + repairs', '2026-02-18', NULL, 'scheduled', 0),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-004'), 'full_service', 'Major engine service — in workshop', '2026-02-15', NULL, 'scheduled', 2200),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'LGV-001'), 'tachograph', 'Digital tacho calibration (2-year)', '2026-03-01', NULL, 'scheduled', 165),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'LGV-002'), 'oil_change', 'Service at 85k', '2026-01-20', '2026-01-20', 'completed', 180);

-- ============================================
-- 6. MESSAGES (sample dispatch communications)
-- ============================================
-- Note: sender_id should be a Supabase Auth UUID
-- These use placeholder values — update with real auth user IDs after login

-- ============================================
-- DONE! Your Movido test fleet is ready.
-- Login at /login, then check /dashboard
-- ============================================
