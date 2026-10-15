// const { randomUUID } = require('crypto');
// const db = require('../db/pool');

// const exec = (client) => client || db;

// function normalizeUidValue(value) {
//   return String(value || '').trim();
// }

// async function findByUid(uid, client) {
//   if (!db.enabled()) return null;
//   const rfid = normalizeUidValue(uid);
//   if (!rfid) return null;

//   try {
//     const { rows } = await exec(client).query(
//       `SELECT c.card_id AS "cardId",
//               c.rfid_id AS uid,
//               c.status AS "cardStatus",
//               c.fisher_id AS "fisherId",
//               c.created_at AS "createdAt",
//               c.updated_at AS "updatedAt",
//               c.last_seen_at AS "lastSeenAt",
//               f.full_name AS name,
//               f.phone_number AS phone
//          FROM cards c
//          LEFT JOIN fishers f ON f.fisher_id = c.fisher_id
//         WHERE upper(c.rfid_id) = upper($1)
//         LIMIT 1`,
//       [rfid]
//     );

//     return rows[0] || null;
//   } catch (err) {
//     if (err && err.code === '42P01') return null;
//     throw err;
//   }
// }

// async function findByFisherId(fisherId, client) {
//   if (!db.enabled()) return null;
//   const { rows } = await exec(client).query(
//     `SELECT c.card_id AS "cardId",
//             c.rfid_id AS uid,
//             c.status AS "cardStatus",
//             c.fisher_id AS "fisherId",
//             c.created_at AS "createdAt",
//             c.updated_at AS "updatedAt",
//             c.last_seen_at AS "lastSeenAt"
//        FROM cards c
//       WHERE c.fisher_id = $1
//       LIMIT 1`,
//     [fisherId]
//   );

//   return rows[0] || null;
// }

// async function create({ uid, status = 'unassigned', fisherId = null }, client) {
//   if (!db.enabled()) return null;
//   const rfid = normalizeUidValue(uid);

//   try {
//     const { rows } = await exec(client).query(
//       `INSERT INTO cards (card_id, rfid_id, status, fisher_id, created_at, updated_at, last_seen_at)
//        VALUES ($1, $2, $3, $4, now(), now(), now())
//        RETURNING card_id AS "cardId",
//                  rfid_id AS uid,
//                  status AS "cardStatus",
//                  fisher_id AS "fisherId",
//                  created_at AS "createdAt",
//                  updated_at AS "updatedAt",
//                  last_seen_at AS "lastSeenAt"`,
//       [randomUUID(), rfid, status, fisherId]
//     );

//     return rows[0] || null;
//   } catch (err) {
//     if (err && err.code === '42P01') return null;
//     throw err;
//   }
// }

// async function touchLastSeen(uid, client) {
//   if (!db.enabled()) return null;
//   const rfid = normalizeUidValue(uid);

//   try {
//     const { rows } = await exec(client).query(
//       `UPDATE cards
//           SET last_seen_at = now(), updated_at = now()
//         WHERE rfid_id = $1
//         RETURNING card_id AS "cardId",
//                   rfid_id AS uid,
//                   status AS "cardStatus",
//                   fisher_id AS "fisherId",
//                   created_at AS "createdAt",
//                   updated_at AS "updatedAt",
//                   last_seen_at AS "lastSeenAt"`,
//       [rfid]
//     );

//     return rows[0] || null;
//   } catch (err) {
//     if (err && err.code === '42P01') return null;
//     throw err;
//   }
// }

// async function assignToFisher({ uid, fisherId }, client) {
//   if (!db.enabled()) return null;
//   const rfid = normalizeUidValue(uid);

//   try {
//     const { rows } = await exec(client).query(
//       `UPDATE cards
//           SET status = 'assigned',
//               fisher_id = $2,
//               updated_at = now(),
//               last_seen_at = now()
//         WHERE rfid_id = $1
//         RETURNING card_id AS "cardId",
//                   rfid_id AS uid,
//                   status AS "cardStatus",
//                   fisher_id AS "fisherId",
//                   created_at AS "createdAt",
//                   updated_at AS "updatedAt",
//                   last_seen_at AS "lastSeenAt"`,
//       [rfid, fisherId]
//     );

//     return rows[0] || null;
//   } catch (err) {
//     if (err && err.code === '42P01') return null;
//     throw err;
//   }
// }

// async function releaseByUid(uid, client) {
//   if (!db.enabled()) return null;
//   const rfid = normalizeUidValue(uid);

//   try {
//     const { rows } = await exec(client).query(
//       `UPDATE cards
//           SET status = 'unassigned',
//               fisher_id = NULL,
//               updated_at = now(),
//               last_seen_at = now()
//         WHERE rfid_id = $1
//         RETURNING card_id AS "cardId",
//                   rfid_id AS uid,
//                   status AS "cardStatus",
//                   fisher_id AS "fisherId",
//                   created_at AS "createdAt",
//                   updated_at AS "updatedAt",
//                   last_seen_at AS "lastSeenAt"`,
//       [rfid]
//     );

//     return rows[0] || null;
//   } catch (err) {
//     if (err && err.code === '42P01') return null;
//     throw err;
//   }
// }

// async function listCards({ cardStatus } = {}, client) {
//   if (!db.enabled()) return [];
//   const conditions = [];
//   const params = [];

//   if (cardStatus) {
//     params.push(cardStatus);
//     conditions.push(`c.status = $${params.length}`);
//   }

//   const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

//   try {
//     const { rows } = await exec(client).query(
//       `SELECT c.card_id AS "cardId",
//               c.rfid_id AS uid,
//               f.full_name AS name,
//               f.phone_number AS phone,
//               c.status AS "cardStatus",
//               CASE WHEN c.status = 'assigned' THEN 'CHECKED IN' ELSE 'CHECKED OUT' END AS status,
//               (SELECT MAX(COALESCE(t.checkout_at, t.checkin_at))
//                  FROM trips t WHERE t.fisher_id = c.fisher_id) AS "lastActivity",
//               c.created_at AS "createdAt"
//          FROM cards c
//          LEFT JOIN fishers f ON f.fisher_id = c.fisher_id
//          ${whereClause}
//         ORDER BY c.updated_at DESC NULLS LAST`,
//       params
//     );

//     return rows.map((row) => ({
//       ...row,
//       cardStatus: String(row.cardStatus || 'unassigned').toLowerCase(),
//       status: String(row.status || 'CHECKED OUT').toUpperCase(),
//       name: row.name || null,
//       phone: row.phone || null,
//       createdAt: row.createdAt,
//       lastActivity: row.lastActivity
//     }));
//   } catch (err) {
//     if (err && err.code === '42P01') return [];
//     throw err;
//   }
// }

// module.exports = {
//   findByUid,
//   findByFisherId,
//   create,
//   touchLastSeen,
//   assignToFisher,
//   releaseByUid,
//   listCards
// };



const { randomUUID } = require('crypto');
const db = require('../db/pool');

const exec = (client) => client || db;

// One row per card, in the shape the dashboard expects. Unassigned cards have no name or phone.
const CARD_ROWS = `
  SELECT c.card_id AS "cardId",
         c.rfid_id AS uid,
         c.status AS "cardStatus",
         f.full_name AS name,
         f.phone_number AS phone,
         CASE WHEN c.status = 'assigned' THEN 'CHECKED IN' ELSE 'CHECKED OUT' END AS status,
         c.created_at AS "createdAt",
         GREATEST(c.last_seen_at,
                  (SELECT MAX(COALESCE(t.checkout_at, t.checkin_at))
                     FROM trips t WHERE t.rfid_id = c.rfid_id)) AS "lastActivity"
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

// Creates the card as unassigned the first time its UID is seen, and records every scan
async function ensure(rfid, client) {
  const { rows } = await exec(client).query(
    `INSERT INTO cards (card_id, rfid_id, status, fisher_id, created_at, updated_at, last_seen_at)
     VALUES ($1, $2, 'unassigned', NULL, now(), now(), now())
     ON CONFLICT (rfid_id) DO UPDATE SET last_seen_at = now()
     RETURNING *`,
    [randomUUID(), rfid]
  );
  return rows[0];
}

// The card with its holder. lock: true keeps a row lock until the transaction ends,
// so two requests for the same card cannot both succeed.
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