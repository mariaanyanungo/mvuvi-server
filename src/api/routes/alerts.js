const express = require('express');
const alerts = require('../../repositories/alertRepository');
const wrap = require('../../utils/asyncHandler');
const { isUuid, clampInt } = require('../../utils/normalize');

const router = express.Router();

router.get('/', wrap(async (req, res) => {
  const { status } = req.query;
  if (status && !['triggered', 'acknowledged', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'status must be triggered, acknowledged or resolved' });
  }
  return res.json(await alerts.list({ status, limit: clampInt(req.query.limit, 50, 1, 200) }));
}));

router.get('/:alertId', wrap(async (req, res) => {
  if (!isUuid(req.params.alertId)) return res.status(400).json({ error: 'alertId must be a UUID' });
  const alert = await alerts.findById(req.params.alertId);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  return res.json(alert);
}));

module.exports = router;
