const { randomUUID } = require('crypto');
const db = require('../db/pool');
const tripRepository = require('./tripRepository');

const exec = (client) => client || db;

async function findHolderByRfid(rfid, client) {
  const { rows } = await exec(client).query(
    `SELECT f.fisher_id, c.rfid_id, f.full_name, f.phone_number
       FROM cards c
       JOIN fishers f ON f.fisher_id = c.fisher_id
      WHERE c.rfid_id = $1 AND c.status = 'assigned'`,
    [rfid]
  );
  return rows[0] || null;
}

async function findByRfid(rfid, client) {
  const bare = String(rfid || '').replace(/^0x/i, '');
  const { rows } = await exec(client).query(
    `SELECT fisher_id, rfid_id, full_name, phone_number, created_at, checkin_at, checkout_at
       FROM fishers
      WHERE upper(rfid_id) IN (upper($1), upper($2))
         OR EXISTS (
              SELECT 1 FROM cards c
               WHERE upper(c.rfid_id) IN (upper($1), upper($2))
                 AND c.fisher_id = fishers.fisher_id
            )
      LIMIT 1`,
    [rfid, bare]
  );
  return rows[0] || null;
}

async function findById(fisherId, client) {
  const { rows } = await exec(client).query(
    `SELECT fisher_id, rfid_id, full_name, phone_number, created_at, checkin_at, checkout_at
       FROM fishers WHERE fisher_id = $1 LIMIT 1`,
    [fisherId]
  );
  return rows[0] || null;
}

// Same person coming back: same name (ignoring case and extra spaces) and same phone digits.
async function findByNameAndPhone(nameKey, phoneKey, client) {
  const key1 = typeof nameKey === 'string' ? nameKey : String(nameKey || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const key2 = typeof phoneKey === 'string' ? phoneKey.replace(/[^0-9+]/g, '') : String(phoneKey || '').replace(/\D/g, '');
  const { rows } = await exec(client).query(
    `SELECT fisher_id, full_name, phone_number
       FROM fishers
      WHERE lower(regexp_replace(btrim(full_name), '[[:space:]]+', ' ', 'g')) = $1
        AND regexp_replace(phone_number, '[^0-9+]', '', 'g') = $2
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE`,
    [key1, key2]
  );
  return rows[0] || null;
}

// New fisher. No card attached yet.
async function insert({ operatorId, name, phone }, client) {
  const { rows } = await exec(client).query(
    `INSERT INTO fishers (fisher_id, rfid_id, operator_id, full_name, phone_number, created_at, checkin_at, checkout_at)
     VALUES ($1, NULL, $2, $3, $4, now(), NULL, NULL)
     RETURNING fisher_id, full_name, phone_number, created_at, checkin_at, checkout_at`,
    [randomUUID(), operatorId, name, phone]
  );
  return rows[0];
}

async function setRfid(fisherId, rfid, client) {
  await exec(client).query(`UPDATE fishers SET rfid_id = $2 WHERE fisher_id = $1`, [fisherId, rfid]);
}

async function clearRfid(fisherId, client) {
  await exec(client).query(`UPDATE fishers SET rfid_id = NULL WHERE fisher_id = $1`, [fisherId]);
}

async function setCheckinAt(fisherId, when, client) {
  await exec(client).query(
    `UPDATE fishers SET checkin_at = $2, checkout_at = NULL WHERE fisher_id = $1`,
    [fisherId, when]
  );
}

// Called on checkout - records the most recent checkout time.
async function setCheckoutAt(fisherId, when, client) {
  await exec(client).query(
    `UPDATE fishers SET checkout_at = $2 WHERE fisher_id = $1`,
    [fisherId, when]
  );
}

// Search fishers by name (used by the pair-card combobox). Empty query returns all.
async function search(query, { limit = 25 } = {}) {
  if (!db.enabled()) return [];
  const term = String(query || '').trim().toLowerCase();
  const params = [];
  let where = '';
  if (term) {
    params.push(`%${term}%`);
    where = `WHERE lower(f.full_name) LIKE $1 OR lower(f.phone_number) LIKE $1`;
  }
  params.push(limit);

  const { rows } = await db.query(
    `SELECT f.fisher_id AS "fisherId",
            f.full_name AS name,
            f.phone_number AS phone,
            f.checkin_at AS "checkinAt",
            f.checkout_at AS "checkoutAt",
            f.created_at AS "createdAt",
            c.rfid_id AS uid,
            c.status AS "cardStatus"
       FROM fishers f
       LEFT JOIN cards c ON c.fisher_id = f.fisher_id
       ${where}
      ORDER BY f.full_name
      LIMIT $${params.length}`,
    params
  );
  return rows.map((row) => ({
    fisherId: row.fisherId,
    name: row.name,
    phone: row.phone,
    uid: row.uid,
    cardStatus: row.cardStatus ? String(row.cardStatus).toLowerCase() : 'unassigned',
    // "Already checked in" = active card assigned AND no checkout recorded
    checkedIn: row.cardStatus === 'assigned',
    checkinAt: row.checkinAt,
    checkoutAt: row.checkoutAt,
    createdAt: row.createdAt
  }));
}

async function listWithStatus() {
  if (!db.enabled()) return [];
  const { rows } = await db.query(
    `SELECT c.rfid_id AS uid,
            f.full_name AS name,
            f.phone_number AS phone,
            c.status AS "cardStatus",
            CASE WHEN c.status = 'assigned' THEN 'CHECKED IN' ELSE 'CHECKED OUT' END AS status,
            (SELECT MAX(COALESCE(t.checkout_at, t.checkin_at))
               FROM trips t WHERE t.fisher_id = f.fisher_id) AS "lastActivity",
            c.created_at AS "createdAt",
            c.fisher_id AS "fisherId",
            EXISTS (
              SELECT 1 FROM trips t
               WHERE t.rfid_id = c.rfid_id OR t.fisher_id = c.fisher_id
            ) AS "everCheckedIn"
       FROM cards c
       LEFT JOIN fishers f ON f.fisher_id = c.fisher_id
      ORDER BY c.updated_at DESC NULLS LAST`
  );

  return rows
    .filter((row) => String(row.name || '').trim().toLowerCase() !== 'jane doe')
    .map((row) => ({
      uid: row.uid,
      name: row.name || null,
      phone: row.phone || null,
      status: String(row.status || 'CHECKED OUT').toUpperCase(),
      cardStatus: String(row.cardStatus || 'unassigned').toLowerCase(),
      lastActivity: row.lastActivity,
      createdAt: row.createdAt,
      fisherId: row.fisherId,
      everCheckedIn: !!row.everCheckedIn
    }));
}

function normalizeComparisonValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}
function isSameHolder(currentName, currentPhone, nextName, nextPhone) {
  return normalizeComparisonValue(currentName) === normalizeComparisonValue(nextName)
    && normalizePhoneDigits(currentPhone) === normalizePhoneDigits(nextPhone);
}

module.exports = {
  findHolderByRfid,
  findByRfid,
  findById,
  findByNameAndPhone,
  insert,
  setRfid,
  clearRfid,
  setCheckinAt,
  setCheckoutAt,
  search,
  listWithStatus,
  isSameHolder
};