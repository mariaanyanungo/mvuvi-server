




// const { publish, EVENTS } = require('../events/eventBus');

// const MAX_ENTRIES = 200;
// const recent = [];
// let activeCard = null;

// function record(entry, { setActive = false } = {}) {
//   const item = { ...entry, timestamp: entry.timestamp || new Date().toISOString() };
//   recent.push(item);
//   if (recent.length > MAX_ENTRIES) recent.shift();

//   if (setActive && item.uid) {
//     activeCard = {
//       uid: item.uid,
//       scannedAt: item.timestamp,
//       name: item.name || null,
//       cardStatus: item.cardStatus || 'unassigned'
//     };
//     publish(EVENTS.ACTIVE_CARD, { ...activeCard });
//   }
//   publish(EVENTS.ACTIVITY, item);
//   return item;
// }

// function getRecent(limit = 20) {
//   return [...recent].reverse().slice(0, limit);
// }

// function getActive() {
//   return activeCard ? { ...activeCard } : null;
// }

// module.exports = { record, getRecent, getActive };


const { publish, EVENTS } = require('../events/eventBus');

// In-memory recent-activity feed and "active card" for the live dashboard.
// The permanent history lives in the trips, location_logs and alerts tables.
const MAX_ENTRIES = 200;
const recent = [];
let activeCard = null;

// setActive: only RFID scans update the active card (the one the dashboard pairs).
// The active card carries its card status, and the holder's name only while it is assigned.
function record(entry, { setActive = false } = {}) {
  const item = { ...entry, timestamp: entry.timestamp || new Date().toISOString() };
  recent.push(item);
  if (recent.length > MAX_ENTRIES) recent.shift();

  if (setActive && item.uid) {
    activeCard = {
      uid: item.uid,
      scannedAt: item.timestamp,
      cardStatus: item.cardStatus || null,
      name: item.cardStatus === 'assigned' ? item.name || null : null
    };
    publish(EVENTS.ACTIVE_CARD, { ...activeCard });
  }
  publish(EVENTS.ACTIVITY, item);
  return item;
}

function getRecent(limit = 20) {
  return [...recent].reverse().slice(0, limit);
}

function getActive() {
  return activeCard ? { ...activeCard } : null;
}

module.exports = { record, getRecent, getActive };