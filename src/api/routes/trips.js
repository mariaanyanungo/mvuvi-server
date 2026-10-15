





const express = require('express');
const trips = require('../../repositories/tripRepository');
const locations = require('../../repositories/locationRepository');
const wrap = require('../../utils/asyncHandler');
const { isUuid, clampInt } = require('../../utils/normalize');

const router = express.Router();

router.get('/', wrap(async (req, res) => {
  const { status, fisherId } = req.query;
  if (status && !['active', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'status must be active or completed' });
  }
  if (fisherId && !isUuid(fisherId)) return res.status(400).json({ error: 'fisherId must be a UUID' });

  return res.json(await trips.list({
    status,
    fisherId,
    limit: clampInt(req.query.limit, 50, 1, 200),
    offset: clampInt(req.query.offset, 0, 0, 100000)
  }));
}));

router.get('/active', wrap(async (req, res) => {
  res.json(await trips.list({ status: 'active', limit: 200 }));
}));

router.get('/:tripId', wrap(async (req, res) => {
  if (!isUuid(req.params.tripId)) return res.status(400).json({ error: 'tripId must be a UUID' });
  const trip = await trips.findById(req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  return res.json(trip);
}));

router.get('/:tripId/locations', wrap(async (req, res) => {
  if (!isUuid(req.params.tripId)) return res.status(400).json({ error: 'tripId must be a UUID' });
  res.json(await locations.list({ tripId: req.params.tripId, limit: clampInt(req.query.limit, 500, 1, 2000) }));
}));

module.exports = router;
