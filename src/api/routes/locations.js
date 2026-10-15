const express = require('express');
const locations = require('../../repositories/locationRepository');
const wrap = require('../../utils/asyncHandler');
const { isUuid, clampInt } = require('../../utils/normalize');

const router = express.Router();

router.get('/', wrap(async (req, res) => {
  const { fisherId, tripId } = req.query;
  if (fisherId && !isUuid(fisherId)) return res.status(400).json({ error: 'fisherId must be a UUID' });
  if (tripId && !isUuid(tripId)) return res.status(400).json({ error: 'tripId must be a UUID' });
  return res.json(await locations.list({ fisherId, tripId, limit: clampInt(req.query.limit, 100, 1, 1000) }));
}));

router.get('/latest', wrap(async (req, res) => {
  res.json(await locations.latestPerFisher());
}));

module.exports = router;
