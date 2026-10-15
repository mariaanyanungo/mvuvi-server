








const { Server } = require('socket.io');
const { config } = require('../config');
const { bus, EVENTS } = require('../events/eventBus');
const activity = require('../services/activityService');
const cardService = require('../services/cardsService');
const tripRepository = require('../repositories/tripRepository');
const { verifyToken } = require('../api/middleware/auth');

function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim()) }
  });

  io.use((socket, next) => {
    if (!config.auth.enabled) return next();

    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) return next();

    try {
      verifyToken(token);
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  async function sendSnapshot(target) {
    target.emit('activeCard', activity.getActive());
    target.emit('events', activity.getRecent(20));
    target.emit('cards', await cardService.listCards());
    target.emit('trip', await tripRepository.list({ limit: 50 }));
  }

  async function broadcastCards() {
    io.emit('cards', await cardService.listCards());
  }

  async function broadcastTrips() {
    io.emit('trip', await tripRepository.list({ limit: 50 }));
  }

  io.on('connection', (socket) => {
    sendSnapshot(socket);
    socket.on('disconnect', () => console.log('[SOCKET] Client disconnected'));
  });

  bus.on(EVENTS.ACTIVITY, () => io.emit('events', activity.getRecent(20)));
  bus.on(EVENTS.ACTIVE_CARD, (card) => io.emit('activeCard', card));
  bus.on(EVENTS.TRIP, async () => {
    await broadcastCards();
    await broadcastTrips();
  });
  bus.on(EVENTS.CARDS, broadcastCards);
  bus.on(EVENTS.ALERT, (alert) => io.emit('alert', alert));
  bus.on(EVENTS.LOCATION, (location) => io.emit('location', location));
  bus.on(EVENTS.DEVICE, (device) => io.emit('device', device));

  return io;
}

module.exports = { createSocketServer };
