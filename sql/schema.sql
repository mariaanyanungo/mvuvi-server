







CREATE TABLE IF NOT EXISTS station_operators (
  operator_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fishers (
  fisher_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfid_id      TEXT UNIQUE,
  operator_id  UUID NOT NULL REFERENCES station_operators (operator_id),
  full_name    TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Migration: ALTER TABLE fishers ALTER COLUMN rfid_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS cards (
  card_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfid_id      TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL CHECK (status IN ('assigned', 'unassigned')) DEFAULT 'unassigned',
  fisher_id    UUID NULL REFERENCES fishers (fisher_id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'assigned' AND fisher_id IS NOT NULL) OR (status = 'unassigned' AND fisher_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cards_fisher_id ON cards (fisher_id) WHERE fisher_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS trips (
  trip_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fisher_id     UUID NOT NULL REFERENCES fishers (fisher_id),
  rfid_id       TEXT NULL,
  total_fishers INTEGER NOT NULL DEFAULT 1,
  checkin_at    TIMESTAMPTZ NOT NULL,
  checkout_at   TIMESTAMPTZ NULL,
  status        TEXT NOT NULL CHECK (status IN ('active', 'completed'))
);
CREATE INDEX IF NOT EXISTS ix_trips_fisher_status ON trips (fisher_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_trips_one_active_per_fisher
  ON trips (fisher_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS location_logs (
  log_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fisher_id   UUID NOT NULL REFERENCES fishers (fisher_id),
  trip_id     UUID NULL REFERENCES trips (trip_id),
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_location_logs_fisher_time ON location_logs (fisher_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS ix_location_logs_trip ON location_logs (trip_id);

CREATE TABLE IF NOT EXISTS distressed_fisher_alerts (
  alert_id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acknowledged_by_operator_id UUID NULL REFERENCES station_operators (operator_id),
  fisher_id                   UUID NOT NULL REFERENCES fishers (fisher_id),
  log_id                      UUID NOT NULL UNIQUE REFERENCES location_logs (log_id),
  triggered_at                TIMESTAMPTZ NOT NULL,
  acknowledged_at             TIMESTAMPTZ NULL,
  resolved_at                 TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS ix_alerts_fisher ON distressed_fisher_alerts (fisher_id, triggered_at DESC);
