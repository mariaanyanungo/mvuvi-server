const db = require('../db/pool');
const cards = require('../repositories/cardRepository');
const fishers = require('../repositories/fisherRepository');
const trips = require('../repositories/tripRepository');
const activity = require('./activityService');
const { publish, EVENTS } = require('../events/eventBus');

async function processRfid({ uid, event }) {
  const normalizedEvent = String(event || 'scan').trim().toLowerCase();
  const result = { uid, event: normalizedEvent, persisted: false, cardStatus: 'unassigned' };

  if (!db.enabled() || !uid) {
    result.note = 'disabled-or-missing-uid';
    activity.record({ uid, event: normalizedEvent, note: result.note, cardStatus: 'unassigned' }, { setActive: true });
    return result;
  }

  let fisher = null;
  let cardRow = null;

  try {
    try {
      const ensured = await cards.ensure(uid);
      cardRow = ensured.card;
    } catch (err) {
      console.error(`[TRIPS] Could not touch card ${uid}:`, err.message);
    }

    fisher = await fishers.findByRfid(uid);
    if (fisher) {
      result.name = fisher.full_name;
      result.fisherId = fisher.fisher_id;
    }

    if (!fisher) {
      result.note = normalizedEvent === 'checkout' ? 'already-unassigned'
        : normalizedEvent === 'checkin' ? 'unassigned'
        : 'scan-only';
      result.event = 'scan';
      result.cardStatus = 'unassigned';
    } else if (normalizedEvent === 'checkout') {
      const active = await trips.findActiveByFisher(fisher.fisher_id);
      if (!active) {
        result.note = 'no-active-trip';
      } else {
        result.trip = await trips.complete(active.trip_id, new Date());
        result.persisted = true;
        result.event = 'checkout';
        result.cardStatus = 'unassigned';
        try { await fishers.setCheckoutAt(fisher.fisher_id, new Date()); } catch (err) {
          console.error(`[TRIPS] Could not stamp checkout time for ${fisher.fisher_id}:`, err.message);
        }
      }
      try {
        if (cardRow && cardRow.card_id) await cards.release(cardRow.card_id);
        await fishers.clearRfid(fisher.fisher_id);
      } catch (err) {
        console.error(`[TRIPS] Could not release card ${uid}:`, err.message);
      }
    } else if (normalizedEvent === 'checkin') {
      const active = await trips.findActiveByFisher(fisher.fisher_id);
      if (active) {
        result.note = 'already-checked-in';
        result.event = 'scan';
        result.cardStatus = 'assigned';
      } else {
        result.trip = await trips.insert({
          fisherId: fisher.fisher_id,
          rfidId: uid,
          totalFishers: 1,
          checkinAt: new Date()
        });
        result.persisted = true;
        result.event = 'checkin';
        result.cardStatus = 'assigned';
        try { await fishers.setCheckinAt(fisher.fisher_id, new Date()); } catch (err) {
          console.error(`[TRIPS] Could not stamp checkin time for ${fisher.fisher_id}:`, err.message);
        }
        try {
          if (cardRow && cardRow.card_id && cardRow.status !== 'assigned') {
            await cards.assign({ cardId: cardRow.card_id, fisherId: fisher.fisher_id });
          }
        } catch (err) {
          console.error(`[TRIPS] Could not assign card ${uid}:`, err.message);
        }
      }
    } else {
      const active = await trips.findActiveByFisher(fisher.fisher_id);
      result.event = 'scan';
      result.note = active ? 'already-checked-in' : 'scan-only';
      result.cardStatus = active ? 'assigned' : 'unassigned';
    }
  } catch (err) {
    console.error(`[TRIPS] Could not process ${normalizedEvent} for ${uid}:`, err.message);
    result.note = 'database-error';
    result.event = normalizedEvent;
    result.cardStatus = null;
  }

  activity.record(
    { uid, event: result.event, name: result.name, cardStatus: result.cardStatus, note: result.note },
    { setActive: true }
  );

  publish(EVENTS.CARDS, null);
  if (result.persisted) {
    publish(EVENTS.TRIP, {
      action: result.event,
      uid,
      fisherId: result.fisherId,
      name: result.name,
      trip: result.trip,
      cardStatus: result.cardStatus
    });
  }

  return result;
}

module.exports = { processRfid };