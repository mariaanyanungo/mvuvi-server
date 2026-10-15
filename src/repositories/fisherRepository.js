
// const { randomUUID } = require('crypto');
// const db = require('../db/pool');
// const tripRepository = require('./tripRepository');

// const exec = (client) => client || db;

// function normalizeComparisonValue(value) {
//   return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
// }

// function normalizePhone(value) {
//   return String(value || '').replace(/\D/g, '');
// }

// function isSameHolder(currentName, currentPhone, nextName, nextPhone) {
//   return normalizeComparisonValue(currentName) === normalizeComparisonValue(nextName)
//     && normalizePhone(currentPhone) === normalizePhone(nextPhone);
// }

// async function findByRfid(rfid, client) {
//   const bare = String(rfid || '').replace(/^0x/i, '');
//   const { rows } = await exec(client).query(
//     `SELECT f.fisher_id, f.rfid_id, f.full_name, f.phone_number, f.created_at,
//             c.status AS card_status
//        FROM fishers f
//        LEFT JOIN cards c ON c.fisher_id = f.fisher_id
//       WHERE upper(f.rfid_id) IN (upper($1), upper($2))
//          OR upper(c.rfid_id) IN (upper($1), upper($2))
//       LIMIT 1`,
//     [rfid, bare]
//   );
//   return rows[0] || null;
// }

// async function findByNameAndPhone(name, phone, client) {
//   const normalizedName = String(name || '').replace(/\s+/g, ' ').trim();
//   const digits = String(phone || '').replace(/\D/g, '');
//   if (!normalizedName || !digits) return null;

//   const { rows } = await exec(client).query(
//     `SELECT fisher_id, rfid_id, full_name, phone_number, created_at
//        FROM fishers
//       WHERE lower(trim(full_name)) = lower(trim($1))
//         AND regexp_replace(phone_number, '[^0-9]', '', 'g') = $2
//       LIMIT 1`,
//     [normalizedName, digits]
//   );

//   return rows[0] || null;
// }

// async function listWithStatus() {
//   if (!db.enabled()) return [];

//   const { rows } = await db.query(
//     `SELECT c.rfid_id AS uid,
//             f.full_name AS name,
//             f.phone_number AS phone,
//             c.status AS "cardStatus",
//             CASE WHEN c.status = 'assigned' THEN 'CHECKED IN' ELSE 'CHECKED OUT' END AS status,
//             (SELECT MAX(COALESCE(t.checkout_at, t.checkin_at))
//                FROM trips t WHERE t.fisher_id = f.fisher_id) AS "lastActivity",
//             c.created_at AS "createdAt",
//             c.fisher_id AS "fisherId"
//        FROM cards c
//        LEFT JOIN fishers f ON f.fisher_id = c.fisher_id
//       ORDER BY c.updated_at DESC NULLS LAST`
//   );

//   return rows
//     .filter((row) => String(row.name || '').trim().toLowerCase() !== 'jane doe')
//     .map((row) => ({
//       uid: row.uid,
//       name: row.name || null,
//       phone: row.phone || null,
//       status: String(row.status || 'CHECKED OUT').toUpperCase(),
//       cardStatus: String(row.cardStatus || 'unassigned').toLowerCase(),
//       lastActivity: row.lastActivity,
//       createdAt: row.createdAt,
//       fisherId: row.fisherId
//     }));
// }

// async function upsertByRfid({ rfid, name, phone, operatorId }) {
//   const normalizedRfid = String(rfid || '').trim();
//   const currentHolder = await findByRfid(normalizedRfid);

//   if (currentHolder && isSameHolder(currentHolder.full_name, currentHolder.phone_number, name, phone)) {
//     return {
//       fisherId: currentHolder.fisher_id,
//       uid: currentHolder.rfid_id,
//       name: currentHolder.full_name,
//       phone: currentHolder.phone_number,
//       createdAt: currentHolder.created_at
//     };
//   }

//   if (!currentHolder) {
//     const { rows } = await db.query(
//       `INSERT INTO fishers (fisher_id, rfid_id, operator_id, full_name, phone_number, created_at)
//        VALUES ($1, $2, $3, $4, $5, now())
//        RETURNING fisher_id AS "fisherId", rfid_id AS uid, full_name AS name,
//                  phone_number AS phone, created_at AS "createdAt"`,
//       [randomUUID(), normalizedRfid, operatorId, name, phone]
//     );
//     return rows[0];
//   }

//   const activeTrip = await tripRepository.findActiveByFisher(currentHolder.fisher_id);
//   if (activeTrip) {
//     const err = new Error('Card is checked in. Check it out before assigning it to someone else');
//     err.status = 409;
//     throw err;
//   }

//   return db.withTransaction(async (client) => {
//     await client.query(
//       `UPDATE fishers SET rfid_id = NULL WHERE fisher_id = $1 AND rfid_id IS NOT NULL`,
//       [currentHolder.fisher_id]
//     );

//     const { rows } = await client.query(
//       `INSERT INTO fishers (fisher_id, rfid_id, operator_id, full_name, phone_number, created_at)
//        VALUES ($1, $2, $3, $4, $5, now())
//        RETURNING fisher_id AS "fisherId", rfid_id AS uid, full_name AS name,
//                  phone_number AS phone, created_at AS "createdAt"`,
//       [randomUUID(), normalizedRfid, operatorId, name, phone]
//     );
//     return rows[0];
//   });
// }

// module.exports = { findByRfid, findByNameAndPhone, listWithStatus, upsertByRfid };


const { randomUUID } = require('crypto');
const db = require('../db/pool');

const exec = (client) => client || db;

// The fisher currently holding a card (only assigned cards have a holder)
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

// Same person coming back: same name (ignoring case and extra spaces) and same phone digits.
// Locks the row so two pairing requests for one person cannot race.
async function findByNameAndPhone(nameKey, phoneKey, client) {
  const { rows } = await exec(client).query(
    `SELECT fisher_id, full_name, phone_number
       FROM fishers
      WHERE lower(regexp_replace(btrim(full_name), '[[:space:]]+', ' ', 'g')) = $1
        AND regexp_replace(phone_number, '[^0-9+]', '', 'g') = $2
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE`,
    [nameKey, phoneKey]
  );
  return rows[0] || null;
}

// New fisher. The card is attached afterwards with setRfid().
async function insert({ operatorId, name, phone }, client) {
  const { rows } = await exec(client).query(
    `INSERT INTO fishers (fisher_id, rfid_id, operator_id, full_name, phone_number, created_at)
     VALUES ($1, NULL, $2, $3, $4, now())
     RETURNING fisher_id, full_name, phone_number`,
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

module.exports = { findHolderByRfid, findByNameAndPhone, insert, setRfid, clearRfid };