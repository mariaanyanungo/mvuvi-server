const { config } = require('../config');
const db = require('../db/pool');
const cards = require('../repositories/cardRepository');
const fishers = require('../repositories/fisherRepository');
const trips = require('../repositories/tripRepository');
const activity = require('./activityService');
const { normalizeUid, isUuid } = require('../utils/normalize');
const { publish, EVENTS } = require('../events/eventBus');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function listCards({ cardStatus } = {}) {
  try {
    // Use the card-centric query so lastActivity is per-UID (survives checkouts).
    const all = await cards.list({ cardStatus });
    return all.map((row) => ({
      uid: row.uid,
      name: row.name || null,
      phone: row.phone || null,
      status: String(row.status || 'CHECKED OUT').toUpperCase(),
      cardStatus: String(row.cardStatus || 'unassigned').toLowerCase(),
      lastActivity: row.lastActivity,
      createdAt: row.createdAt,
      fisherId: null,
      everCheckedIn: !!row.lastActivity
    }));
  } catch (err) {
    console.error('[CARDS] Could not list cards:', err.message);
    return [];
  }
}

function normalizeTotalFishers(value) {
  if (value === undefined || value === null || value === '') {
    throw httpError(400, 'Total fisher count is required.');
  }
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw httpError(400, 'Total fisher count must be a whole number of at least 1.');
  }
  return n;
}

async function pairCard({ uid, fisherId, totalFishers }) {
  const rfid = normalizeUid(String(uid || ''));
  if (!rfid) throw httpError(400, 'A valid RFID UID is required.');
  if (!isUuid(fisherId)) throw httpError(400, 'A valid fisherId is required.');

  const fisherCount = normalizeTotalFishers(totalFishers);

  const outcome = await db.withTransaction(async (client) => {
    const ensured = await cards.ensure(rfid, client);
    const card = await cards.findByRfid(rfid, client, { lock: true });
    if (!card) throw httpError(404, 'Card not found.');

    if (card.status === 'assigned' && card.fisher_id && card.fisher_id !== fisherId) {
      throw httpError(409, `Card is assigned to ${card.full_name || 'someone else'} and checked in. Check out first.`);
    }

    const fisher = await fishers.findById(fisherId, client);
    if (!fisher) throw httpError(404, 'Fisher not found.');

    const otherCard = await client.query(
      `SELECT c.rfid_id FROM cards c
        WHERE c.fisher_id = $1 AND c.status = 'assigned' AND c.rfid_id <> $2`,
      [fisherId, rfid]
    );
    if (otherCard.rows.length > 0) {
      throw httpError(409, `${fisher.full_name} is already checked in with another card.`);
    }

    const active = await trips.findActiveByFisher(fisher.fisher_id, client);
    if (active && card.status === 'assigned' && card.fisher_id === fisherId) {
      return { fisher, trip: active, alreadyCheckedIn: true };
    }

    await fishers.setRfid(fisher.fisher_id, rfid, client);
    await cards.assign({ cardId: card.card_id, fisherId: fisher.fisher_id }, client);
    await fishers.setCheckinAt(fisher.fisher_id, new Date(), client);

    const trip = active || await trips.insert({
      fisherId: fisher.fisher_id,
      rfidId: rfid,
      totalFishers: fisherCount,
      checkinAt: new Date()
    }, client);

    return { fisher, trip, alreadyCheckedIn: !!active };
  }).catch((err) => {
    if (err.code === '23505') {
      throw httpError(409, 'This card or fisher was just assigned by another request. Refresh and try again.');
    }
    throw err;
  });

  const row = await cards.getRow(rfid);
  const holderName = outcome.fisher.full_name;

  activity.record(
    { uid: rfid, event: 'checkin', name: holderName, cardStatus: 'assigned' },
    { setActive: true }
  );
  publish(EVENTS.TRIP, {
    action: 'checkin',
    uid: rfid,
    fisherId: outcome.fisher.fisher_id,
    name: holderName,
    trip: outcome.trip
  });
  publish(EVENTS.CARDS, null);

  return { ...row, trip: outcome.trip };
}

async function searchFishers(query) {
  return fishers.search(query);
}

async function registerFisher({ name, phone, operatorId }) {
  const fullName = String(name || '').trim().replace(/\s+/g, ' ');
  if (!fullName) throw httpError(400, 'Name is required.');

  const phoneNumber = String(phone || '').trim();
  if (!/^[+0-9\s-]+$/.test(phoneNumber) || !/\d/.test(phoneNumber)) {
    throw httpError(400, 'Phone number must include digits and may use +, spaces and dashes.');
  }

  const operator = operatorId || config.defaultOperatorId;
  if (!operator) {
    throw httpError(400, 'No operator ID available. Send operator_id or set DEFAULT_OPERATOR_ID.');
  }

  const fisher = await db.withTransaction(async (client) => {
    const existing = await fishers.findByNameAndPhone(fullName, phoneNumber, client);
    if (existing) throw httpError(409, `${existing.full_name} is already registered.`);
    return fishers.insert({ operatorId: operator, name: fullName, phone: phoneNumber }, client);
  });

  publish(EVENTS.CARDS, null);
  return {
    fisherId: fisher.fisher_id,
    name: fisher.full_name,
    phone: fisher.phone_number,
    createdAt: fisher.created_at,
    cardStatus: 'unassigned',
    status: 'CHECKED OUT'
  };
}

// Register a card UID into the cards table. Tells you whether it was created or already existed.
async function registerCard({ uid }) {
  const rfid = normalizeUid(String(uid || ''));
  if (!rfid) throw httpError(400, 'A valid RFID UID is required.');

  const { card, wasCreated } = await db.withTransaction(async (client) => {
    return cards.ensure(rfid, client);
  });

  publish(EVENTS.CARDS, null);

  return {
    uid: rfid,
    cardStatus: 'unassigned',
    status: 'CHECKED OUT',
    createdAt: card.created_at,
    wasCreated,
    message: wasCreated
      ? `Card ${rfid} registered successfully.`
      : `Card ${rfid} is already registered.`
  };
}

module.exports = { listCards, pairCard, searchFishers, registerFisher, registerCard };