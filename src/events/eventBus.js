



const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(100);

const EVENTS = {
  ACTIVITY: 'activity',      // one entry for the recent-activity feed
  ACTIVE_CARD: 'activeCard', // most recently scanned card
  CARDS: 'cards',            // registered cards changed
  TRIP: 'trip',              // a trip was started or completed
  LOCATION: 'location',      // a GPS position arrived
  ALERT: 'alert',            // an SOS alert arrived
  DEVICE: 'device'           // station device state changed
};

function publish(name, payload) {
  bus.emit(name, payload);
}

module.exports = { bus, EVENTS, publish };
