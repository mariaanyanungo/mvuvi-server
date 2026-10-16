const express = require('express');
const activity = require('../../services/activityService');
const cardService = require('../../services/cardsService');
const wrap = require('../../utils/asyncHandler');
const { isUuid, clampInt } = require('../../utils/normalize');
const router = express.Router();

router.get('/active', (req, res) => {
  const a = activity.getActive();
  res.json(
    a
      ? { uid: a.uid, scannedAt: a.scannedAt, cardStatus: a.cardStatus, name: a.name }
      : { uid: null, scannedAt: null, cardStatus: null, name: null }
  );
});

router.get('/events', (req, res) => {
  res.json(activity.getRecent(clampInt(req.query.limit, 100, 1, 200)));
});

router.get('/cards', wrap(async (req, res) => {
  const { cardStatus } = req.query;
  if (cardStatus && !['assigned', 'unassigned'].includes(cardStatus)) {
    return res.status(400).json({ error: 'cardStatus must be assigned or unassigned' });
  }
  return res.json(await cardService.listCards({ cardStatus }));
}));

router.get('/fishers', wrap(async (req, res) => {
  const q = req.query.search || req.query.q || '';
  try {
    const list = await cardService.searchFishers(q);
    console.log(`[API] /api/fishers?search="${q}" -> ${list.length} result(s)`);
    return res.json(list);
  } catch (err) {
    console.error('[API] /api/fishers failed:', err.message);
    return res.status(500).json({ error: err.message || 'Could not search fishers' });
  }
}));

router.post('/fishers', wrap(async (req, res) => {
  const body = req.body || {};
  const operatorId = [body.operator_id, req.operator && req.operator.sub].find(isUuid);
  const result = await cardService.registerFisher({
    name: body.name,
    phone: body.phone,
    operatorId
  });
  return res.status(201).json(result);
}));

router.post('/cards', wrap(async (req, res) => {
  const body = req.body || {};
  const result = await cardService.pairCard({
    uid: body.uid,
    fisherId: body.fisherId,
    totalFishers: body.totalFishers !== undefined ? body.totalFishers : body.total_fishers
  });
  return res.status(200).json(result);
}));

router.post('/cards/register', wrap(async (req, res) => {
  const body = req.body || {};
  const result = await cardService.registerCard({ uid: body.uid });
  return res.status(201).json(result);
}));

module.exports = router;