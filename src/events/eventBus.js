const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(100);

const EVENTS = {
  ACTIVITY: 'activity',
  ACTIVE_CARD: 'activeCard', 
  CARDS: 'cards',            
  TRIP: 'trip',              
  LOCATION: 'location',      
  ALERT: 'alert',            
  DEVICE: 'device'           
};

function publish(name, payload) {
  bus.emit(name, payload);
}

module.exports = { bus, EVENTS, publish };
