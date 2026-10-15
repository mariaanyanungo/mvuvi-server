




// const { config } = require('../config');
// const db = require('../db/pool');
// const fishers = require('../repositories/fisherRepository');
// const cardRepository = require('../repositories/cardRepository');
// const trips = require('../repositories/tripRepository');
// const { normalizeUid } = require('../utils/normalize');
// const { publish, EVENTS } = require('../events/eventBus');

// const PLACEHOLDER_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

// async function ensurePlaceholderOperator() {
//   if (!db.enabled()) return null;

//   await db.query(
//     `INSERT INTO station_operators (operator_id, first_name, last_name, email, password_hash)
//      VALUES ($1, 'Station', 'Operator', 'station.operator@local', 'placeholder')
//      ON CONFLICT (operator_id) DO NOTHING`,
//     [PLACEHOLDER_OPERATOR_ID]
//   );

//   return PLACEHOLDER_OPERATOR_ID;
// }

// function httpError(status, message) {
//   const err = new Error(message);
//   err.status = status;
//   return err;
// }

// async function ensureCard(uid) {
//   const rfid = normalizeUid(String(uid || ''));
//   if (!rfid) return null;
//   if (!db.enabled()) {
//     return { uid: rfid, cardStatus: 'unassigned', fisherId: null, name: null, phone: null, status: 'CHECKED OUT' };
//   }

//   try {
//     const existing = await cardRepository.findByUid(rfid);
//     if (existing) {
//       await cardRepository.touchLastSeen(rfid);
//       return existing;
//     }

//     return await db.withTransaction(async (client) => {
//       const created = await cardRepository.create({ uid: rfid, status: 'unassigned', fisherId: null }, client);
//       return created || { uid: rfid, cardStatus: 'unassigned', fisherId: null, name: null, phone: null };
//     });
//   } catch (err) {
//     console.error('[CARDS] Could not ensure card:', err.message);
//     return { uid: rfid, cardStatus: 'unassigned', fisherId: null, name: null, phone: null };
//   }
// }

// async function listCards({ cardStatus } = {}) {
//   try {
//     const rows = await fishers.listWithStatus();
//     const filtered = rows.filter((row) => {
//       if (!cardStatus) return true;
//       return String(row.cardStatus || 'unassigned').toLowerCase() === String(cardStatus).toLowerCase();
//     });

//     return filtered.map((row) => ({
//       uid: row.uid,
//       name: row.name || null,
//       phone: row.phone || null,
//       status: String(row.status || 'CHECKED OUT').toUpperCase(),
//       cardStatus: String(row.cardStatus || 'unassigned').toLowerCase(),
//       lastActivity: row.lastActivity,
//       createdAt: row.createdAt
//     }));
//   } catch (err) {
//     console.error('[CARDS] Could not list cards:', err.message);
//     return [];
//   }
// }

// async function findCardHolderName({ uid }, client) {
//   const card = await cardRepository.findByUid(uid, client);
//   if (!card || !card.fisherId) return null;
//   const { rows } = await (client || db).query(
//     `SELECT full_name AS name FROM fishers WHERE fisher_id = $1 LIMIT 1`,
//     [card.fisherId]
//   );
//   return rows[0] ? rows[0].name : null;
// }

// async function registerCard({ uid, name, phone, operatorId }) {
//   const rfid = normalizeUid(String(uid || ''));
//   if (!rfid) throw httpError(400, 'A valid RFID UID is required.');

//   const fullName = String(name || '').trim();
//   if (!fullName) throw httpError(400, 'Name is required.');

//   const phoneNumber = String(phone || '').trim();
//   if (!/^[+0-9\s-]+$/.test(phoneNumber) || !/\d/.test(phoneNumber)) {
//     throw httpError(400, 'Phone number must include digits and may use +, spaces and dashes.');
//   }

//   const operator = operatorId || config.defaultOperatorId || (await ensurePlaceholderOperator());
//   if (!operator) throw httpError(401, 'No authenticated station operator is available for this scan.');

//   const result = await db.withTransaction(async (client) => {
//     const existingCard = await cardRepository.findByUid(rfid, client);
//     if (existingCard && existingCard.cardStatus === 'assigned') {
//       const currentHolder = await findCardHolderName({ uid: rfid }, client);
//       const message = currentHolder ? `Card is assigned to ${currentHolder} and checked in. Check out first.` : 'Card is assigned and checked in. Check out first.';
//       const err = new Error(message);
//       err.status = 409;
//       throw err;
//     }

//     const existingFisher = await fishers.findByNameAndPhone(fullName, phoneNumber, client);
//     let fisher = existingFisher;

//     if (!fisher) {
//       const inserted = await client.query(
//         `INSERT INTO fishers (fisher_id, rfid_id, operator_id, full_name, phone_number, created_at)
//          VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
//          RETURNING fisher_id AS "fisherId", rfid_id AS uid, full_name AS name, phone_number AS phone, created_at AS "createdAt"`,
//         [rfid, operator, fullName, phoneNumber]
//       );
//       fisher = inserted.rows[0];
//     }

//     const fisherActiveTrip = await trips.findActiveByFisher(fisher.fisher_id || fisher.fisherId, client);
//     if (fisherActiveTrip) {
//       const err = new Error(`${fullName} is already checked in with another card`);
//       err.status = 409;
//       throw err;
//     }

//     if (existingCard) {
//       await client.query(
//         `UPDATE fishers SET rfid_id = $1 WHERE fisher_id = $2`,
//         [rfid, fisher.fisher_id || fisher.fisherId]
//       );
//     }

//     const card = await cardRepository.assignToFisher({ uid: rfid, fisherId: fisher.fisher_id || fisher.fisherId }, client);
//     const trip = await trips.insert({ fisherId: fisher.fisher_id || fisher.fisherId, rfidId: rfid, checkinAt: new Date() }, client);
//     const activeName = fisher.full_name || fisher.name;

//     await client.query(
//       `UPDATE fishers SET rfid_id = $1 WHERE fisher_id = $2`,
//       [rfid, fisher.fisher_id || fisher.fisherId]
//     );

//     return {
//       uid: card.uid,
//       name: activeName,
//       phone: phoneNumber,
//       cardStatus: 'assigned',
//       status: 'CHECKED IN',
//       fisherId: fisher.fisher_id || fisher.fisherId,
//       trip,
//       card
//     };
//   });

//   const activeName = result.name || fullName;
//   publish(EVENTS.CARDS, null);
//   publish(EVENTS.TRIP, {
//     action: 'checkin',
//     uid: rfid,
//     fisherId: result.fisherId,
//     name: activeName,
//     trip: result.trip,
//     cardStatus: 'assigned'
//   });
//   publish(EVENTS.ACTIVE_CARD, {
//     uid: rfid,
//     name: activeName,
//     cardStatus: 'assigned',
//     scannedAt: new Date().toISOString()
//   });

//   return {
//     uid: rfid,
//     name: activeName,
//     phone: phoneNumber,
//     cardStatus: 'assigned',
//     status: 'CHECKED IN',
//     fisherId: result.fisherId,
//     trip: result.trip
//   };
// }

// async function releaseCard({ uid }) {
//   const rfid = normalizeUid(String(uid || ''));
//   if (!rfid) throw httpError(400, 'A valid RFID UID is required.');

//   const result = await db.withTransaction(async (client) => {
//     const card = await cardRepository.findByUid(rfid, client);
//     if (!card || !card.fisherId) {
//       const existing = await cardRepository.create({ uid: rfid, status: 'unassigned', fisherId: null }, client);
//       return { uid: rfid, cardStatus: 'unassigned', name: null, phone: null, trip: null, card: existing };
//     }

//     const activeTrip = await trips.findActiveByFisher(card.fisherId, client);
//     if (activeTrip) {
//       await trips.complete(activeTrip.trip_id, new Date(), client);
//     }

//     await client.query(
//       `UPDATE fishers SET rfid_id = NULL WHERE fisher_id = $1`,
//       [card.fisherId]
//     );

//     const updated = await cardRepository.releaseByUid(rfid, client);
//     const holder = await client.query(
//       `SELECT full_name AS name, phone_number AS phone FROM fishers WHERE fisher_id = $1 LIMIT 1`,
//       [card.fisherId]
//     );

//     return {
//       uid: rfid,
//       name: holder.rows[0] ? holder.rows[0].name : null,
//       phone: holder.rows[0] ? holder.rows[0].phone : null,
//       cardStatus: 'unassigned',
//       status: 'CHECKED OUT',
//       trip: activeTrip || null,
//       card: updated
//     };
//   });

//   publish(EVENTS.CARDS, null);
//   if (result.trip) {
//     publish(EVENTS.TRIP, {
//       action: 'checkout',
//       uid: rfid,
//       fisherId: result.card && result.card.fisherId,
//       trip: result.trip,
//       cardStatus: 'unassigned'
//     });
//   }
//   publish(EVENTS.ACTIVE_CARD, {
//     uid: rfid,
//     name: null,
//     cardStatus: 'unassigned',
//     scannedAt: new Date().toISOString()
//   });

//   return result;
// }

// module.exports = { listCards, registerCard, releaseCard, ensureCard, ensurePlaceholderOperator };



const { config } = require('../config');
const db = require('../db/pool');
const cards = require('../repositories/cardRepository');
const fishers = require('../repositories/fisherRepository');
const trips = require('../repositories/tripRepository');
const activity = require('./activityService');
const { normalizeUid } = require('../utils/normalize');
const { publish, EVENTS } = require('../events/eventBus');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Cards table for the dashboard. Returns an empty list when there is no database.
async function listCards({ cardStatus } = {}) {
  if (!db.enabled()) return [];
  try {
    return await cards.list({ cardStatus });
  } catch (err) {
    console.error('[CARDS] Could not list cards:', err.message);
    return [];
  }
}

/*
 * "Save pairing": assigns an UNASSIGNED card to a person and checks them in.
 * One transaction: find or create the fisher, attach the card, start a NEW trip.
 * Another person's name and phone are never overwritten.
 */
async function pairCard({ uid, name, phone, operatorId }) {
  const rfid = normalizeUid(String(uid || ''));
  if (!rfid) throw httpError(400, 'A valid RFID UID is required.');

  const fullName = String(name || '').trim().replace(/\s+/g, ' ');
  if (!fullName) throw httpError(400, 'Name is required.');

  const phoneNumber = String(phone || '').trim();
  if (!/^[+0-9\s-]+$/.test(phoneNumber) || !/\d/.test(phoneNumber)) {
    throw httpError(400, 'Phone number must include digits and may use +, spaces and dashes.');
  }

  let outcome;
  try {
    outcome = await db.withTransaction(async (client) => {
      await cards.ensure(rfid, client);
      const card = await cards.findByRfid(rfid, client, { lock: true });

      if (card.status === 'assigned') {
        throw httpError(409, `Card is assigned to ${card.full_name} and checked in. Check out first.`);
      }

      // Same person (same name and phone) keeps one fisher record; anyone else gets a new one
      let fisher = await fishers.findByNameAndPhone(
        fullName.toLowerCase(),
        phoneNumber.replace(/[^0-9+]/g, ''),
        client
      );

      if (fisher) {
        const active = await trips.findActiveByFisher(fisher.fisher_id, client);
        if (active) throw httpError(409, `${fisher.full_name} is already checked in with another card.`);
      } else {
        const operator = operatorId || config.defaultOperatorId;
        if (!operator) {
          throw httpError(400, 'No operator ID available. Send operator_id or set DEFAULT_OPERATOR_ID.');
        }
        fisher = await fishers.insert({ operatorId: operator, name: fullName, phone: phoneNumber }, client);
      }

      await fishers.setRfid(fisher.fisher_id, rfid, client);
      await cards.assign({ cardId: card.card_id, fisherId: fisher.fisher_id }, client);
      const trip = await trips.insert({ fisherId: fisher.fisher_id, rfidId: rfid, checkinAt: new Date() }, client);
      return { fisher, trip };
    });
  } catch (err) {
    // A unique index caught a race (the card or the fisher was assigned a moment ago)
    if (err.code === '23505') {
      throw httpError(409, 'This card or fisher was just assigned by another request. Refresh and try again.');
    }
    throw err;
  }

  const row = await cards.getRow(rfid);

  activity.record(
    { uid: rfid, event: 'checkin', name: outcome.fisher.full_name, cardStatus: 'assigned' },
    { setActive: true }
  );
  publish(EVENTS.TRIP, {
    action: 'checkin',
    uid: rfid,
    fisherId: outcome.fisher.fisher_id,
    name: outcome.fisher.full_name,
    trip: outcome.trip
  });
  publish(EVENTS.CARDS, null);

  return { ...row, trip: outcome.trip };
}

module.exports = { listCards, pairCard };