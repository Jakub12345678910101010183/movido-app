-- ============================================
-- MOVIDO — Seed Data for Manus Supabase
-- Run AFTER 003_fix_schema_for_manus.sql
-- Uses the auth user Manus already created:
--   UUID: b1a6bcf1-eeb4-47a7-ba74-d85b6bc1b303
--   Email: dispatch@movido.com
-- ============================================

-- 1. DISPATCHER USER (using Manus-created auth user)
INSERT INTO users (id, email, name, role, subscription_plan, subscription_status)
VALUES ('b1a6bcf1-eeb4-47a7-ba74-d85b6bc1b303', 'dispatch@movido.com', 'Dispatch Admin', 'dispatcher', 'professional', 'trial')
ON CONFLICT (id) DO UPDATE SET name = 'Dispatch Admin', role = 'dispatcher';

-- 2. VEHICLES (8 HGV/LGV fleet based in Northampton)
INSERT INTO vehicles (vehicle_id, make, model, registration, type, status, fuel_level, mileage, height, weight, width, length) VALUES
  ('HGV-001', 'DAF', 'XF 530', 'NX72 KLO', 'hgv', 'active', 78, 124500, 4.0, 18.0, 2.55, 13.6),
  ('HGV-002', 'Volvo', 'FH 500', 'BF71 MNP', 'hgv', 'active', 45, 198200, 4.0, 18.0, 2.55, 13.6),
  ('HGV-003', 'Scania', 'R450', 'KR73 DEF', 'hgv', 'active', 92, 67300, 4.0, 18.0, 2.55, 13.6),
  ('HGV-004', 'Mercedes', 'Actros 2545', 'WX70 RST', 'hgv', 'maintenance', 33, 245100, 4.0, 18.0, 2.55, 13.6),
  ('HGV-005', 'MAN', 'TGX 18.510', 'LN72 GHJ', 'hgv', 'active', 65, 156700, 4.0, 18.0, 2.55, 13.6),
  ('HGV-006', 'Iveco', 'S-Way 490', 'PE71 ABC', 'hgv', 'active', 55, 89000, 4.0, 18.0, 2.55, 13.6),
  ('LGV-001', 'DAF', 'CF 340', 'DX73 XYZ', 'lgv', 'active', 12, 42300, 2.7, 3.5, 2.0, 7.0),
  ('VAN-001', 'Volvo', 'FM 330', 'HN70 QWE', 'van', 'idle', 88, 23100, 2.3, 3.0, 1.9, 5.9);

-- 3. DRIVERS (6 drivers — matching Manus seed names)
INSERT INTO drivers (name, email, phone, license_type, status, rating, hours_today, hours_week, total_deliveries) VALUES
  ('James Wilson', 'james@movido.com', '+44 7700 100001', 'C+E', 'on_duty', 4.8, 6.5, 38, 342),
  ('Sarah Mitchell', 'sarah@movido.com', '+44 7700 100002', 'C+E', 'available', 4.6, 0, 32, 287),
  ('David Thompson', 'david@movido.com', '+44 7700 100003', 'C+E', 'on_break', 4.9, 7.2, 41, 415),
  ('Emma Roberts', 'emma@movido.com', '+44 7700 100004', 'C', 'on_duty', 4.5, 5.0, 28, 198),
  ('Michael Chen', 'michael@movido.com', '+44 7700 100005', 'C+E', 'available', 4.7, 0, 35, 310),
  ('Lisa Kowalski', 'lisa@movido.com', '+44 7700 100006', 'C', 'off_duty', 4.3, 0, 22, 156);

-- Assign vehicles to drivers
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-001') WHERE name = 'James Wilson';
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-002') WHERE name = 'Sarah Mitchell';
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-003') WHERE name = 'David Thompson';
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-005') WHERE name = 'Emma Roberts';
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-006') WHERE name = 'Michael Chen';
UPDATE drivers SET vehicle_id = (SELECT id FROM vehicles WHERE vehicle_id = 'LGV-001') WHERE name = 'Lisa Kowalski';

-- Set driver locations (around Northampton + on routes)
UPDATE drivers SET location_lat = 52.2405, location_lng = -0.9027 WHERE name = 'James Wilson';
UPDATE drivers SET location_lat = 52.4862, location_lng = -1.8904 WHERE name = 'Emma Roberts';
UPDATE drivers SET location_lat = 52.2310, location_lng = -0.8850 WHERE name = 'David Thompson';

-- 4. JOBS (10 sample deliveries — real UK addresses)
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
   (SELECT id FROM drivers WHERE name = 'Emma Roberts'),
   (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-005'),
   'Moulton Park, Northampton, NN3 6AQ', 52.2600, -0.8810,
   'Amazon MK1, Ridgmont, MK43 0ZA', 52.0290, -0.5720,
   'pending', NOW() + INTERVAL '1 hour'),

  ('JOB-2026-003', 'B&Q Warehouse', 'assigned', 'medium',
   (SELECT id FROM drivers WHERE name = 'Sarah Mitchell'),
   (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-002'),
   'Swan Valley, Northampton, NN4 9BB', 52.2130, -0.9350,
   'B&Q DC, Worksop, S80 1UZ', 53.2960, -1.1330,
   'pending', NOW() + INTERVAL '4 hours'),

  ('JOB-2026-004', 'Royal Mail Depot', 'assigned', 'low',
   (SELECT id FROM drivers WHERE name = 'Michael Chen'),
   (SELECT id FROM vehicles WHERE vehicle_id = 'HGV-006'),
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
   (SELECT id FROM drivers WHERE name = 'Sarah Mitchell'),
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
   (SELECT id FROM drivers WHERE name = 'Lisa Kowalski'),
   (SELECT id FROM vehicles WHERE vehicle_id = 'LGV-001'),
   'Magna Park, Milton Keynes, MK17 8EW', 52.0100, -0.8050,
   'John Lewis, Leicester, LE1 4FQ', 52.6369, -1.1398,
   'pending', NOW() + INTERVAL '90 minutes');

-- 5. MAINTENANCE RECORDS
INSERT INTO fleet_maintenance (vehicle_id, type, description, scheduled_date, completed_date, status, cost) VALUES
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-001'), 'service', 'Regular 50k service oil change', '2026-02-01', '2026-02-01', 'completed', 280),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-001'), 'tyre', 'Steer axle tyre replacement', '2026-02-25', NULL, 'scheduled', 850),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-002'), 'service', '200k full service inspection', '2026-02-10', NULL, 'scheduled', 1450),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-003'), 'inspection', 'Annual brake disc and pad check', '2026-01-15', '2026-01-15', 'completed', 420),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-004'), 'mot', 'Annual MOT + repairs', '2026-02-18', NULL, 'scheduled', 0),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'HGV-004'), 'service', 'Major engine service — in workshop', '2026-02-15', NULL, 'overdue', 2200),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'LGV-001'), 'inspection', 'Digital tacho calibration (2-year)', '2026-03-01', NULL, 'scheduled', 165),
  ((SELECT id FROM vehicles WHERE vehicle_id = 'VAN-001'), 'service', 'Service at 23k', '2026-01-20', '2026-01-20', 'completed', 180);

-- 6. SAMPLE MESSAGES
INSERT INTO messages (sender_id, recipient_id, channel, content) VALUES
  ('b1a6bcf1-eeb4-47a7-ba74-d85b6bc1b303', NULL, 'dispatch', 'Morning all — check your allocations on the dashboard. JOB-2026-009 is urgent.'),
  ('driver-james', NULL, 'driver', 'Loaded and heading to Magna Park now. ETA 14:30.'),
  ('driver-emma', NULL, 'driver', 'Traffic on A45 eastbound, might be 15 mins late.'),
  ('b1a6bcf1-eeb4-47a7-ba74-d85b6bc1b303', NULL, 'dispatch', 'Emma — noted. Update ETA when you clear traffic.'),
  ('system', NULL, 'system', 'Low fuel alert: LGV-001 at 12%. Please refuel before next run.');

-- ============================================
-- DONE! Your Movido fleet is ready.
-- Login: dispatch@movido.com / Movido2024!
-- ============================================
