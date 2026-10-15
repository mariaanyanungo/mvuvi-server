













const { config } = require('../config');
const { publish, EVENTS } = require('../events/eventBus');

const devices = new Map();

function ensure(id) {
  if (!devices.has(id)) {
    devices.set(id, {
      id,
      type: 'station',
      online: null,
      heartbeat: false,
      firstSeen: null,
      lastSeen: null,
      lastTopic: null,
      messageCount: 0
    });
  }
  return devices.get(id);
}

function setOnline(device, online) {
  if (device.online !== online) {
    device.online = online;
    publish(EVENTS.DEVICE, { ...device });
  }
}

function touch(id, topic) {
  const device = ensure(id);
  const now = new Date().toISOString();
  device.firstSeen = device.firstSeen || now;
  device.lastSeen = now;
  device.lastTopic = topic;
  device.messageCount += 1;
  return device;
}

function setState(id, state) {
  const device = ensure(id);
  device.heartbeat = true;
  device.lastSeen = new Date().toISOString();
  setOnline(device, state === 'online');
}

function list() {
  return [...devices.values()].map((d) => ({ ...d }));
}

function get(id) {
  const device = devices.get(id);
  return device ? { ...device } : null;
}

function startSweeper() {
  const limitMs = config.station.offlineAfterSeconds * 1000;
  setInterval(() => {
    for (const device of devices.values()) {
      if (device.heartbeat && device.online && Date.now() - Date.parse(device.lastSeen) > limitMs) {
        setOnline(device, false);
      }
    }
  }, 10000).unref();
}

module.exports = { touch, setState, list, get, startSweeper };
