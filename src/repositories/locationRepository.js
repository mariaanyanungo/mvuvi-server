








const { randomUUID } = require('crypto');
const db = require('../db/pool');

const exec = (client) => client || db;

async function insert({ fisherId, tripId, latitude, longitude, recordedAt }, client) {
  const { rows } = await exec(client).query(
    `INSERT INTO location_logs (log_id, fisher_id, trip_id, latitude, longitude, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [randomUUID(), fisherId, tripId || null, latitude, longitude, recordedAt]
  );
  return rows[0];
}

async function list({ fisherId, tripId, limit = 100 }) {
  const where = [];
  const params = [];
  if (fisherId) { params.push(fisherId); where.push(`l.fisher_id = $${params.length}`); }
  if (tripId) { params.push(tripId); where.push(`l.trip_id = $${params.length}`); }
  params.push(limit);
  const { rows } = await db.query(
    `SELECT l.log_id, l.fisher_id, f.full_name, l.trip_id, l.latitude, l.longitude, l.recorded_at
       FROM location_logs l
       JOIN fishers f ON f.fisher_id = l.fisher_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY l.recorded_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function latestPerFisher() {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (l.fisher_id)
            l.log_id, l.fisher_id, f.full_name, f.rfid_id, l.trip_id,
            l.latitude, l.longitude, l.recorded_at
       FROM location_logs l
       JOIN fishers f ON f.fisher_id = l.fisher_id
      ORDER BY l.fisher_id, l.recorded_at DESC`
  );
  return rows;
}

async function findLatestByFisher(fisherId, client) {
  const { rows } = await exec(client).query(
    `SELECT * FROM location_logs WHERE fisher_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [fisherId]
  );
  return rows[0] || null;
}

module.exports = { insert, list, latestPerFisher, findLatestByFisher };
