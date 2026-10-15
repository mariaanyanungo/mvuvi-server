


INSERT INTO station_operators (operator_id, first_name, last_name, email, password_hash)
VALUES ('00000000-0000-0000-0000-000000000001', 'Station', 'Operator', 'station.operator@local', 'placeholder')
ON CONFLICT DO NOTHING;
