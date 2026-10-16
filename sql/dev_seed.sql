INSERT INTO station_operators (operator_id, first_name, last_name, email, password_hash)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo', 'Operator', 'demo@local', 'x')
ON CONFLICT (email) DO NOTHING;

INSERT INTO fishers (fisher_id, rfid_id, operator_id, full_name, phone_number, created_at, checkin_at, checkout_at)
VALUES
  ('00000000-0000-0000-0000-00000000f001', NULL, '00000000-0000-0000-0000-000000000001', 'Amina Okello',    '+254700000001', now(), NULL, NULL),
  ('00000000-0000-0000-0000-00000000f002', NULL, '00000000-0000-0000-0000-000000000001', 'Tafadzwa Mapendo','+254700000002', now(), NULL, NULL),
  ('00000000-0000-0000-0000-00000000f003', NULL, '00000000-0000-0000-0000-000000000001', 'John Mwangi',     '+254700000003', now(), NULL, NULL),
  ('00000000-0000-0000-0000-00000000f004', NULL, '00000000-0000-0000-0000-000000000001', 'Grace Wanjiru',   '+254700000004', now(), NULL, NULL)
ON CONFLICT (fisher_id) DO NOTHING;