const { randomUUID } = require('crypto');
const db = require('../db/pool');

const exec = (client) => client || db;

const CARD_ROWS = `
  SELECT c.card_id AS "cardId",
         c.rfid_id AS uid,
         c.status AS "cardStatus",
         f.full_name AS name,
         f.phone_number AS phone,
         CASE WHEN c.status = 'assigned' THEN 'CHECKED IN' ELSE 'CHECKED OUT' END AS status,
         c.created_at AS "createdAt",
         GREATEST(
           c.last_seen_at,
           COALESCE((SELECT MAX(COALESCE(t.checkout_at, t.checkin_at))
                       FROM trips t WHERE t.rfid_id = c.rfid_id), c.last_seen_at)
         ) AS "lastActivity"
    FROM cards c
    LEFT JOIN fishers f ON f.fisher_id = c.fisher_id`;

async function list({ cardStatus } = {}) {
  const params = [];
  let where = '';
  if (cardStatus) {
    params.push(cardStatus);
    where = 'WHERE c.status = $1';
  }
  const { rows } = await db.query(
    `${CARD_ROWS} ${where} ORDER BY COALESCE(c.last_seen_at, c.created_at) DESC`,
    params
  );
  return rows;
}

async function getRow(rfid, client) {
  const { rows } = await exec(client).query(`${CARD_ROWS} WHERE c.rfid_id = $1`, [rfid]);
  return rows[0] || null;
}

// Returns { card, wasCreated } so the API can tell the operator which case happened.
async function ensure(rfid, client) {
  const existing = await exec(client).query(
    `SELECT card_id FROM cards WHERE rfid_id = $1`,
    [rfid]
  );
  const wasCreated = existing.rows.length === 0;

  const { rows } = await exec(client).query(
    `INSERT INTO cards (card_id, rfid_id, status, fisher_id, created_at, updated_at, last_seen_at)
     VALUES ($1, $2, 'unassigned', NULL, now(), now(), now())
     ON CONFLICT (rfid_id) DO UPDATE SET last_seen_at = now()
     RETURNING *`,
    [randomUUID(), rfid]
  );
  return { card: rows[0], wasCreated };
}

async function findByRfid(rfid, client, { lock = false } = {}) {
  const { rows } = await exec(client).query(
    `SELECT c.card_id, c.rfid_id, c.status, c.fisher_id, f.full_name, f.phone_number
       FROM cards c
       LEFT JOIN fishers f ON f.fisher_id = c.fisher_id
      WHERE c.rfid_id = $1
      ${lock ? 'FOR UPDATE OF c' : ''}`,
    [rfid]
  );
  return rows[0] || null;
}

async function assign({ cardId, fisherId }, client) {
  const { rows } = await exec(client).query(
    `UPDATE cards SET status = 'assigned', fisher_id = $2, updated_at = now()
      WHERE card_id = $1 AND status = 'unassigned'
      RETURNING *`,
    [cardId, fisherId]
  );
  return rows[0] || null;
}

async function release(cardId, client) {
  const { rows } = await exec(client).query(
    `UPDATE cards SET status = 'unassigned', fisher_id = NULL, updated_at = now()
      WHERE card_id = $1
      RETURNING *`,
    [cardId]
  );
  return rows[0] || null;
}

module.exports = { list, getRow, ensure, findByRfid, assign, release };