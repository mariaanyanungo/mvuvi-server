const express = require('express');

function createRoutes(store) {
  const router = express.Router();

  router.get('/cards', (req, res) => {
    res.json(store.getCardsWithStatus());
  });

  router.post('/cards', (req, res) => {
    try {
      const card = store.upsertCard(req.body || {});
      res.status(200).json(card);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Invalid card payload.' });
    }
  });

  router.get('/events', (req, res) => {
    res.json(store.getRecentEvents(1000));
  });

  router.get('/active', (req, res) => {
    const activeCard = store.getActiveCard();
    res.json(activeCard ? { uid: activeCard.uid, scannedAt: activeCard.scannedAt } : { uid: null, scannedAt: null });
  });

  return router;
}

module.exports = { createRoutes };
