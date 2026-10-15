-- Add the card assignment model and keep historical fisher/card assignment state consistent.

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

CREATE UNIQUE INDEX IF NOT EXISTS ux_cards_fisher_id
  ON cards (fisher_id) WHERE fisher_id IS NOT NULL;

ALTER TABLE fishers ALTER COLUMN rfid_id DROP NOT NULL;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS rfid_id TEXT;

UPDATE trips t
   SET rfid_id = f.rfid_id
  FROM fishers f
 WHERE t.fisher_id = f.fisher_id
   AND t.rfid_id IS NULL
   AND f.rfid_id IS NOT NULL;

INSERT INTO cards (card_id, rfid_id, status, fisher_id, created_at, updated_at, last_seen_at)
SELECT gen_random_uuid(), f.rfid_id, 'assigned', f.fisher_id, now(), now(), now()
  FROM fishers f
 WHERE f.rfid_id IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM trips t
      WHERE t.fisher_id = f.fisher_id
        AND t.status = 'active'
   )
ON CONFLICT (rfid_id) DO NOTHING;

INSERT INTO cards (card_id, rfid_id, status, fisher_id, created_at, updated_at, last_seen_at)
SELECT gen_random_uuid(), f.rfid_id, 'unassigned', NULL, now(), now(), now()
  FROM fishers f
 WHERE f.rfid_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM cards c
      WHERE c.rfid_id = f.rfid_id
   )
ON CONFLICT (rfid_id) DO NOTHING;

UPDATE cards c
   SET fisher_id = f.fisher_id,
       status = 'assigned',
       updated_at = now()
  FROM fishers f
 WHERE c.rfid_id = f.rfid_id
   AND f.rfid_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM trips t
      WHERE t.fisher_id = f.fisher_id
        AND t.status = 'active'
   );

UPDATE cards c
   SET fisher_id = NULL,
       status = 'unassigned',
       updated_at = now()
  FROM fishers f
 WHERE c.rfid_id = f.rfid_id
   AND f.rfid_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM trips t
      WHERE t.fisher_id = f.fisher_id
        AND t.status = 'active'
   );

-- Keep fisher.rfid_id aligned with the card while it is assigned.
UPDATE fishers f
   SET rfid_id = c.rfid_id
  FROM cards c
 WHERE c.fisher_id = f.fisher_id
   AND c.status = 'assigned';

UPDATE fishers f
   SET rfid_id = NULL
  FROM cards c
 WHERE c.fisher_id = f.fisher_id
   AND c.status = 'unassigned';
