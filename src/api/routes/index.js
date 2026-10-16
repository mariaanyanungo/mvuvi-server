const express = require('express');
const { requireAuth } = require('../middleware/auth');
const sse = require('../../websocket/sse');
const health = require('./health');
const devices = require('./devices');
const trips = require('./trips');
const locations = require('./locations');
const alerts = require('./alerts');
const legacy = require('./legacy');

const router = express.Router();

router.use('/api/health', health);

const api = express.Router();
api.get('/stream', sse.handler);       
api.use('/devices', devices);
api.use('/trips', trips);
api.use('/locations', locations);
api.use('/alerts', alerts);
api.use('/', legacy);                   
api.use((req, res) => res.status(404).json({ error: 'Not found' }));

router.use('/api', requireAuth, api);

module.exports = router;