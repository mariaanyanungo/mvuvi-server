















const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');

const { config } = require('./src/config');
const db = require('./src/db/pool');
const routes = require('./src/api/routes');
const { createSocketServer } = require('./src/websocket/socketio');
const sse = require('./src/websocket/sse');
const registry = require('./src/devices/registry');
const { createMqttClient } = require('./src/mqtt/client');

if (config.auth.enabled && !config.auth.secret) {
  console.error('[CONFIG] AUTH_ENABLED=true requires JWT_SECRET_KEY.');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '1mb' }));
app.use(routes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (err.code === 'DB_DISABLED') return res.status(503).json({ error: 'Database is not configured' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error('[SERVER] Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
});

const io = createSocketServer(server);
sse.init();
registry.startSweeper();
const mqttClient = createMqttClient();

server.listen(config.port, () => {
  console.log(`[SERVER] Dashboard and API running on http://localhost:${config.port}`);
  console.log(`[SERVER] Database: ${db.enabled() ? 'configured' : 'not configured (live feed only)'}`);
  console.log(`[SERVER] API auth: ${config.auth.enabled ? 'enabled' : 'disabled'}`);
});

async function shutdown(signal) {
  console.log(`[SERVER] ${signal} received, shutting down...`);
  mqttClient.end(true);
  io.close();
  server.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
