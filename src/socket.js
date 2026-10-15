const { Server } = require('socket.io');

function createSocketServer(server, store) {
  const io = new Server(server, {
    cors: {
      origin: '*'
    }
  });

  io.on('connection', (socket) => {
    socket.emit('activeCard', store.getActiveCard());
    socket.emit('cards', store.getCardsWithStatus());
    socket.emit('events', store.getRecentEvents(20));

    socket.on('disconnect', () => {
      console.log('[SOCKET] Client disconnected');
    });
  });

  function broadcastState() {
    io.emit('activeCard', store.getActiveCard());
    io.emit('cards', store.getCardsWithStatus());
    io.emit('events', store.getRecentEvents(20));
  }

  return { io, broadcastState };
}

module.exports = { createSocketServer };
