





// const express = require('express');
// const activity = require('../../services/activityService');
// const cardService = require('../../services/cardsService');
// const tripRepository = require('../../repositories/tripRepository');
// const wrap = require('../../utils/asyncHandler');
// const { clampInt } = require('../../utils/normalize');

// const router = express.Router();

// router.get('/active', (req, res) => {
//   const active = activity.getActive();
//   res.json(active ? { uid: active.uid, scannedAt: active.scannedAt } : { uid: null, scannedAt: null });
// });

// router.get('/events', (req, res) => {
//   res.json(activity.getRecent(clampInt(req.query.limit, 100, 1, 200)));
// });

// router.get('/cards', wrap(async (req, res) => {
//   res.json(await cardService.listCards());
// }));

// router.get('/trips', wrap(async (req, res) => {
//   const limit = clampInt(req.query.limit, 100, 1, 200);
//   const trips = await tripRepository.list({ limit });
//   res.json(trips);
// }));

// router.post('/cards', wrap(async (req, res) => {
//   const body = req.body || {};
//   const operatorId = req.operator && req.operator.sub;

//   const card = await cardService.registerCard({
//     uid: body.uid,
//     name: body.name,
//     phone: body.phone,
//     operatorId
//   });
//   res.status(200).json(card);
// }));

// module.exports = router;


const express = require('express');
const activity = require('../../services/activityService');
const cardService = require('../../services/cardService');
const wrap = require('../../utils/asyncHandler');
const { isUuid, clampInt } = require('../../utils/normalize');

// The endpoints the dashboard calls. Same paths; responses only gained new fields.
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

// One row per card. Optional filter: ?cardStatus=assigned|unassigned
router.get('/cards', wrap(async (req, res) => {
  const { cardStatus } = req.query;
  if (cardStatus && !['assigned', 'unassigned'].includes(cardStatus)) {
    return res.status(400).json({ error: 'cardStatus must be assigned or unassigned' });
  }
  return res.json(await cardService.listCards({ cardStatus }));
}));

// "Save pairing": { uid, name, phone } assigns the card and checks the person in
router.post('/cards', wrap(async (req, res) => {
  const body = req.body || {};
  const operatorId = [body.operator_id, req.operator && req.operator.sub].find(isUuid);
  const result = await cardService.pairCard({ uid: body.uid, name: body.name, phone: body.phone, operatorId });
  res.status(200).json(result);
}));

module.exports = router;