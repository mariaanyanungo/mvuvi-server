const { randomUUID } = require('crypto');
const db = require('../db/pool');

const exec = (client) => client || db;

// rfid_id comes from the trip itself, so history keeps the UID after the card is reused
const SELECT_TRIP = `
  SELECT t.trip_id, t.fisher_id, t.total_fishers, t.checkin_at, t.checkout_at, t.status,
         f.full_name, COALESCE(t.rfid_id, f.rfid_id) AS rfid_id
    FROM trips t
    JOIN fishers f ON f.fisher_id = t.fisher_id`;

async function findActiveByFisher(fisherId, client) {
  const { rows } = await exec(client).query(
    `SELECT * FROM trips
      WHERE fisher_id = $1 AND status = 'active'
      ORDER BY checkin_at DESC LIMIT 1`,
    [fisherId]
  );
  return rows[0] || null;
}

// Every check-in is a NEW row. Completed trips are never reused or changed.
async function insert({ fisherId, rfidId, totalFishers = 1, checkinAt }, client) {
  const { rows } = await exec(client).query(
    `INSERT INTO trips (trip_id, fisher_id, rfid_id, total_fishers, checkin_at, checkout_at, status)
     VALUES ($1, $2, $3, $4, $5, NULL, 'active')
     RETURNING *`,
    [randomUUID(), fisherId, rfidId, totalFishers, checkinAt]
  );
  return rows[0];
}

async function complete(tripId, checkoutAt, client) {
  const { rows } = await exec(client).query(
    `UPDATE trips SET checkout_at = $2, status = 'completed'
      WHERE trip_id = $1 AND status = 'active'
      RETURNING *`,
    [tripId, checkoutAt]
  );
  return rows[0] || null;
}

async function list({ status, fisherId, limit = 50, offset = 0 }) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`t.status = $${params.length}`); }
  if (fisherId) { params.push(fisherId); where.push(`t.fisher_id = $${params.length}`); }
  params.push(limit, offset);
  const { rows } = await db.query(
    `${SELECT_TRIP}
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY t.checkin_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function findById(tripId) {
  const { rows } = await db.query(`${SELECT_TRIP} WHERE t.trip_id = $1`, [tripId]);
  return rows[0] || null;
}

module.exports = { findActiveByFisher, insert, complete, list, findById };