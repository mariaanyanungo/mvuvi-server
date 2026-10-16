const express = require('express');
const db = require('../../db/pool');
const registry = require('../../devices/registry');
const { getState } = require('../../mqtt/client');
const wrap = require('../../utils/asyncHandler');

const router = express.Router();

router.get('/', wrap(async (req, res) => {
  const configured = db.enabled();
  const reachable = configured ? await db.ping() : false;
  const mqtt = getState();

  res.json({
    status: mqtt.connected && (!configured || reachable) ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    mqtt,
    database: { configured, reachable },
    devices: registry.list()
  });
}));

module.exports = router;
