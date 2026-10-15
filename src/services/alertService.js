




// const { config } = require('../config');
// const db = require('../db/pool');
// const fishers = require('../repositories/fisherRepository');
// const trips = require('../repositories/tripRepository');
// const locations = require('../repositories/locationRepository');
// const alerts = require('../repositories/alertRepository');
// const cardsService = require('./cardsService');
// const activity = require('./activityService');
// const { validCoordinates } = require('../utils/normalize');
// const { publish, EVENTS } = require('../events/eventBus');

// async function notifyWebhook(alert) {
//   if (!config.alertWebhookUrl) return;
//   try {
//     await fetch(config.alertWebhookUrl, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         alertId: alert.alertId,
//         fisherId: alert.fisherId,
//         latitude: alert.latitude,
//         longitude: alert.longitude,
//         triggeredAt: alert.triggeredAt
//       }),
//       signal: AbortSignal.timeout(5000)
//     });
//   } catch (err) {
//     console.error('[ALERTS] Webhook failed:', err.message);
//   }
// }

// async function raiseSos({ uid, latitude, longitude, triggeredAt }) {
//   const alert = { uid, latitude, longitude, triggeredAt: triggeredAt.toISOString(), persisted: false };

//   if (db.enabled()) {
//     try {
//       const card = await cardsService.ensureCard(uid);
//       const fisher = card && card.fisherId ? await fishers.findByRfid(uid) : null;

//       if (!fisher || !card || card.cardStatus === 'unassigned') {
//         alert.note = card && card.cardStatus === 'unassigned' ? 'unassigned' : 'unregistered';
//       } else {
//         alert.fisherId = fisher.fisher_id;
//         alert.name = fisher.full_name;

//         const duplicate = await alerts.findRecentOpen(fisher.fisher_id, config.sos.dedupeSeconds);
//         if (duplicate) {
//           console.log(`[ALERTS] Duplicate SOS from ${uid} ignored.`);
//           return { ...alert, note: 'duplicate', alertId: duplicate.alert_id };
//         }

//         let lat = latitude;
//         let lon = longitude;
//         if (!validCoordinates(lat, lon)) {
//           const last = await locations.findLatestByFisher(fisher.fisher_id);
//           if (last) {
//             lat = last.latitude;
//             lon = last.longitude;
//             alert.note = 'last-known-location';
//           }
//         }

//         if (validCoordinates(lat, lon)) {
//           const created = await db.withTransaction(async (client) => {
//             const trip = await trips.findActiveByFisher(fisher.fisher_id, client);
//             const log = await locations.insert(
//               { fisherId: fisher.fisher_id, tripId: trip ? trip.trip_id : null, latitude: lat, longitude: lon, recordedAt: triggeredAt },
//               client
//             );
//             return alerts.insert({ fisherId: fisher.fisher_id, logId: log.log_id, triggeredAt }, client);
//           });
//           Object.assign(alert, { persisted: true, alertId: created.alert_id, latitude: lat, longitude: lon });
//         } else {
//           alert.note = 'no-location';
//         }
//       }
//     } catch (err) {
//       console.error(`[ALERTS] Could not store SOS for ${uid}:`, err.message);
//       alert.note = 'database-error';
//     }
//   }

//   activity.record({ uid, event: 'sos', name: alert.name, note: alert.note }, { setActive: false });
//   publish(EVENTS.ALERT, alert);
//   if (alert.persisted) notifyWebhook(alert);
//   return alert;
// }

// module.exports = { raiseSos };


const { config } = require('../config');
const db = require('../db/pool');
const cards = require('../repositories/cardRepository');
const fishers = require('../repositories/fisherRepository');
const trips = require('../repositories/tripRepository');
const locations = require('../repositories/locationRepository');
const alerts = require('../repositories/alertRepository');
const activity = require('./activityService');
const { validCoordinates } = require('../utils/normalize');
const { publish, EVENTS } = require('../events/eventBus');

// Optional: tell another service (e.g. the AI service) that a new alert was stored
async function notifyWebhook(alert) {
  if (!config.alertWebhookUrl) return;
  try {
    await fetch(config.alertWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alertId: alert.alertId,
        fisherId: alert.fisherId,
        latitude: alert.latitude,
        longitude: alert.longitude,
        triggeredAt: alert.triggeredAt
      }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (err) {
    console.error('[ALERTS] Webhook failed:', err.message);
  }
}

/*
 * Stores an SOS alert: a location log (the SOS position) and the alert that references it,
 * inside one transaction. If the SOS has no GPS fix, the fisher's last known position is used.
 * A repeated SOS from the same fisher within SOS_DEDUPE_SECONDS is ignored.
 * An SOS from an UNASSIGNED card is shown live with a note, but no rows are stored.
 */
async function raiseSos({ uid, latitude, longitude, triggeredAt }) {
  const alert = { uid, latitude, longitude, triggeredAt: triggeredAt.toISOString(), persisted: false };

  if (db.enabled()) {
    try {
      await cards.ensure(uid);
      const fisher = await fishers.findHolderByRfid(uid);

      if (!fisher) {
        alert.note = 'unassigned';
      } else {
        alert.fisherId = fisher.fisher_id;
        alert.name = fisher.full_name;

        const duplicate = await alerts.findRecentOpen(fisher.fisher_id, config.sos.dedupeSeconds);
        if (duplicate) {
          console.log(`[ALERTS] Duplicate SOS from ${uid} ignored.`);
          return { ...alert, note: 'duplicate', alertId: duplicate.alert_id };
        }

        let lat = latitude;
        let lon = longitude;
        if (!validCoordinates(lat, lon)) {
          const last = await locations.findLatestByFisher(fisher.fisher_id);
          if (last) {
            lat = last.latitude;
            lon = last.longitude;
            alert.note = 'last-known-location';
          }
        }

        if (validCoordinates(lat, lon)) {
          const created = await db.withTransaction(async (client) => {
            const trip = await trips.findActiveByFisher(fisher.fisher_id, client);
            const log = await locations.insert(
              { fisherId: fisher.fisher_id, tripId: trip ? trip.trip_id : null, latitude: lat, longitude: lon, recordedAt: triggeredAt },
              client
            );
            return alerts.insert({ fisherId: fisher.fisher_id, logId: log.log_id, triggeredAt }, client);
          });
          Object.assign(alert, { persisted: true, alertId: created.alert_id, latitude: lat, longitude: lon });
        } else {
          alert.note = 'no-location';
        }
      }
    } catch (err) {
      console.error(`[ALERTS] Could not store SOS for ${uid}:`, err.message);
      alert.note = 'database-error';
    }
  }

  // The live dashboard hears about every SOS, even one that could not be stored
  activity.record({ uid, event: 'sos', name: alert.name, note: alert.note }, { setActive: false });
  publish(EVENTS.ALERT, alert);
  if (alert.persisted) notifyWebhook(alert);
  return alert;
}

module.exports = { raiseSos };