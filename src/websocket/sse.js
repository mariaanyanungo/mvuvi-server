







const { bus, EVENTS } = require('../events/eventBus');
const activity = require('../services/activityService');
const registry = require('../devices/registry');

const clients = new Set();

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const res of clients) send(res, event, data);
}

function handler(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');

  send(res, 'snapshot', {
    activeCard: activity.getActive(),
    events: activity.getRecent(20),
    devices: registry.list()
  });

  clients.add(res);
  req.on('close', () => clients.delete(res));
}

function init() {
  bus.on(EVENTS.ACTIVITY, (entry) => broadcast('activity', entry));
  bus.on(EVENTS.ACTIVE_CARD, (card) => broadcast('activeCard', card));
  bus.on(EVENTS.TRIP, (trip) => broadcast('trip', trip));
  bus.on(EVENTS.LOCATION, (location) => broadcast('location', location));
  bus.on(EVENTS.ALERT, (alert) => broadcast('alert', alert));
  bus.on(EVENTS.DEVICE, (device) => broadcast('device', device));

  setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 25000).unref();
}

module.exports = { init, handler };
