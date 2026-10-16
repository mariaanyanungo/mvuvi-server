const db = require('../db/pool');
const cards = require('../repositories/cardRepository');
const fishers = require('../repositories/fisherRepository');
const trips = require('../repositories/tripRepository');
const locations = require('../repositories/locationRepository');
const { publish, EVENTS } = require('../events/eventBus');

// Stores a GPS position and links it to the holder's active trip.
// A card with no holder (unassigned) is shown live but not stored, because a fisher is required.
async function ingestLocation({ uid, latitude, longitude, recordedAt }) {
  const payload = { uid, latitude, longitude, recordedAt: recordedAt.toISOString(), persisted: false };

  if (db.enabled()) {
    try {
      await cards.ensure(uid);  // first sight creates the card, every message updates last_seen_at
      const fisher = await fishers.findHolderByRfid(uid);

      if (!fisher) {
        payload.note = 'unassigned';
      } else {
        const trip = await trips.findActiveByFisher(fisher.fisher_id);
        const log = await locations.insert({
          fisherId: fisher.fisher_id,
          tripId: trip ? trip.trip_id : null,
          latitude,
          longitude,
          recordedAt
        });
        Object.assign(payload, {
          persisted: true,
          logId: log.log_id,
          fisherId: fisher.fisher_id,
          name: fisher.full_name,
          tripId: log.trip_id
        });
      }
    } catch (err) {
      console.error(`[LOCATION] Could not store position for ${uid}:`, err.message);
      payload.note = 'database-error';
    }
  }

  publish(EVENTS.LOCATION, payload);
  return payload;
}

module.exports = { ingestLocation };