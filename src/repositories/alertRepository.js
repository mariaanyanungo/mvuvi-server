const { randomUUID } = require('crypto');
const db = require('../db/pool');

const exec = (client) => client || db;

const SELECT_ALERT = `
  SELECT a.alert_id, a.fisher_id, a.log_id, a.triggered_at, a.acknowledged_at, a.resolved_at,
         a.acknowledged_by_operator_id,
         f.full_name, f.phone_number, f.rfid_id,
         l.latitude, l.longitude, l.trip_id,
         CASE WHEN a.resolved_at IS NOT NULL THEN 'resolved'
              WHEN a.acknowledged_at IS NOT NULL THEN 'acknowledged'
              ELSE 'triggered' END AS status
    FROM distressed_fisher_alerts a
    JOIN fishers f ON f.fisher_id = a.fisher_id
    JOIN location_logs l ON l.log_id = a.log_id`;

const STATUS_FILTER = {
  triggered: 'a.acknowledged_at IS NULL AND a.resolved_at IS NULL',
  acknowledged: 'a.acknowledged_at IS NOT NULL AND a.resolved_at IS NULL',
  resolved: 'a.resolved_at IS NOT NULL'
};

async function insert({ fisherId, logId, triggeredAt }, client) {
  const { rows } = await exec(client).query(
    `INSERT INTO distressed_fisher_alerts
       (alert_id, acknowledged_by_operator_id, fisher_id, log_id, triggered_at, acknowledged_at, resolved_at)
     VALUES ($1, NULL, $2, $3, $4, NULL, NULL)
     RETURNING *`,
    [randomUUID(), fisherId, logId, triggeredAt]
  );
  return rows[0];
}

async function findRecentOpen(fisherId, seconds) {
  const { rows } = await db.query(
    `SELECT * FROM distressed_fisher_alerts
      WHERE fisher_id = $1 AND resolved_at IS NULL
        AND triggered_at > now() - ($2 * interval '1 second')
      ORDER BY triggered_at DESC LIMIT 1`,
    [fisherId, seconds]
  );
  return rows[0] || null;
}

async function list({ status, limit = 50 }) {
  const where = STATUS_FILTER[status] ? `WHERE ${STATUS_FILTER[status]}` : '';
  const { rows } = await db.query(
    `${SELECT_ALERT} ${where} ORDER BY a.triggered_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function findById(alertId) {
  const { rows } = await db.query(`${SELECT_ALERT} WHERE a.alert_id = $1`, [alertId]);
  return rows[0] || null;
}

module.exports = { insert, findRecentOpen, list, findById };
