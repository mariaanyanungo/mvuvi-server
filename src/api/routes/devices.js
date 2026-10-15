







const express = require('express');
const registry = require('../../devices/registry');

const router = express.Router();

router.get('/', (req, res) => res.json(registry.list()));

router.get('/:id', (req, res) => {
  const device = registry.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  return res.json(device);
});

module.exports = router;
