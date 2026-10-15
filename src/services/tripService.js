




// const db = require('../db/pool');
// const fishers = require('../repositories/fisherRepository');
// const trips = require('../repositories/tripRepository');
// const cardsService = require('./cardsService');
// const activity = require('./activityService');
// const { publish, EVENTS } = require('../events/eventBus');

// async function processRfid({ uid, event }) {
//   const normalizedEvent = String(event || 'scan').trim().toLowerCase();
//   const explicitCheckin = normalizedEvent === 'checkin';
//   const explicitCheckout = normalizedEvent === 'checkout';
//   const scanEvent = normalizedEvent === 'scan';
//   const result = { uid, event: normalizedEvent, persisted: false, cardStatus: 'unassigned' };
//   let fisher = null;
//   let card = null;

//   if (!db.enabled() || !uid) {
//     activity.record({ uid, event: normalizedEvent, note: 'disabled-or-missing-uid', cardStatus: 'unassigned' }, { setActive: true });
//     return { ...result, note: 'disabled-or-missing-uid' };
//   }

//   try {
//     card = await cardsService.ensureCard(uid);
//     result.cardStatus = card && card.cardStatus ? card.cardStatus : 'unassigned';
//     fisher = card && card.fisherId ? await fishers.findByRfid(uid) : null;

//     if (!card) {
//       result.note = 'unregistered';
//     } else if (card.cardStatus === 'assigned' && fisher) {
//       const active = await trips.findActiveByFisher(fisher.fisher_id);

//       if (explicitCheckin) {
//         result.note = 'already-checked-in';
//       } else if (explicitCheckout) {
//         if (!active) {
//           result.note = 'no-active-trip';
//         } else {
//           const released = await cardsService.releaseCard({ uid });
//           result.trip = released.trip;
//           result.persisted = true;
//           result.note = 'checked-out';
//           result.cardStatus = 'unassigned';
//         }
//       } else if (scanEvent) {
//         result.note = active ? 'already-checked-in' : 'scan-only';
//         result.event = 'scan';
//       }
//     } else {
//       if (explicitCheckout) {
//         result.note = 'already-unassigned';
//       } else if (explicitCheckin) {
//         result.note = 'unassigned';
//       } else if (scanEvent) {
//         result.note = 'scan-only';
//       }
//     }
//   } catch (err) {
//     console.error(`[TRIPS] Could not process ${normalizedEvent} for ${uid}:`, err.message);
//     result.note = 'database-error';
//   }

//   activity.record(
//     {
//       uid,
//       event: result.event || normalizedEvent,
//       name: fisher ? fisher.full_name : (card && card.name) || undefined,
//       cardStatus: result.cardStatus,
//       note: result.note
//     },
//     { setActive: true }
//   );

//   if (result.persisted) {
//     publish(EVENTS.TRIP, {
//       action: result.event,
//       uid,
//       fisherId: fisher && fisher.fisher_id,
//       name: fisher && fisher.full_name,
//       trip: result.trip,
//       cardStatus: 'unassigned'
//     });
//   }

//   return result;
// }

// module.exports = { processRfid };



const db = require('../db/pool');
const cards = require('../repositories/cardRepository');
const fishers = require('../repositories/fisherRepository');
const trips = require('../repositories/tripRepository');
const activity = require('./activityService');
const { publish, EVENTS } = require('../events/eventBus');

/*
 * Applies one RFID event to the card, inside a single transaction.
 *
 *  unassigned card: the scan only updates the active card. No trip, because there is no fisher.
 *  assigned card:   checkin  -> ignored (duplicate)
 *                   scan     -> informational (the card is waiting for the checkout button)
 *                   checkout -> completes the trip AND releases the card (it becomes unassigned)
 */
async function applyToCard({ uid, event }, client) {
  await cards.ensure(uid, client);  // creates the card on first sight, records last_seen_at
  const card = await cards.findByRfid(uid, client, { lock: true });

  if (card.status === 'unassigned') {
    return {
      effective: 'scan',
      cardStatus: 'unassigned',
      note: event === 'checkout' ? 'checkout-ignored' : 'unassigned',
      persisted: false
    };
  }

  const base = { name: card.full_name, fisherId: card.fisher_id, cardStatus: 'assigned', persisted: false };

  if (event === 'checkin') return { ...base, effective: 'scan', note: 'already-checked-in' };
  if (event === 'scan') return { ...base, effective: 'scan' };

  // checkout
  const active = await trips.findActiveByFisher(card.fisher_id, client);
  const trip = active ? await trips.complete(active.trip_id, new Date(), client) : null;
  await cards.release(card.card_id, client);
  await fishers.clearRfid(card.fisher_id, client);

  return {
    ...base,
    effective: 'checkout',
    cardStatus: 'unassigned',
    trip,
    note: active ? undefined : 'no-active-trip',
    persisted: true
  };
}

async function processRfid({ uid, event }) {
  // Without a database the live feed still works, with no card status
  let outcome = { effective: event, cardStatus: null, persisted: false };

  if (db.enabled()) {
    try {
      outcome = await db.withTransaction((client) => applyToCard({ uid, event }, client));
    } catch (err) {
      console.error(`[TRIPS] Could not process ${event} for ${uid}:`, err.message);
      outcome = { effective: 'scan', cardStatus: null, note: 'database-error', persisted: false };
    }
  }

  activity.record(
    { uid, event: outcome.effective, name: outcome.name, cardStatus: outcome.cardStatus, note: outcome.note },
    { setActive: true }
  );

  if (db.enabled()) publish(EVENTS.CARDS, null);

  if (outcome.persisted && outcome.effective === 'checkout') {
    publish(EVENTS.TRIP, {
      action: 'checkout',
      uid,
      fisherId: outcome.fisherId,
      name: outcome.name,
      trip: outcome.trip
    });
  }
  return outcome;
}

module.exports = { processRfid };