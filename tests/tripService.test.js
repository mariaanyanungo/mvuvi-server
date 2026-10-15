const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db/pool');
const fishers = require('../src/repositories/fisherRepository');
const trips = require('../src/repositories/tripRepository');
const activity = require('../src/services/activityService');
const tripService = require('../src/services/tripService');
const cardsService = require('../src/services/cardsService');

test('listCards exposes cardStatus and keeps unassigned cards visible', async () => {
  const originalListWithStatus = require('../src/repositories/fisherRepository').listWithStatus;

  try {
    require('../src/repositories/fisherRepository').listWithStatus = async () => [
      { uid: '0xAAAA', name: null, phone: null, status: 'CHECKED OUT', cardStatus: 'unassigned' },
      { uid: '0xBBBB', name: 'Amina Okello', phone: '+254700000000', status: 'CHECKED IN', cardStatus: 'assigned' }
    ];

    const cards = await cardsService.listCards();
    assert.equal(cards[0].cardStatus, 'unassigned');
    assert.equal(cards[1].cardStatus, 'assigned');
  } finally {
    require('../src/repositories/fisherRepository').listWithStatus = originalListWithStatus;
  }
});

test('scan does not checkout until an explicit checkout event is triggered', async () => {
  const originalEnabled = db.enabled;
  const originalFindByRfid = fishers.findByRfid;
  const originalFindActiveByFisher = trips.findActiveByFisher;
  const originalInsert = trips.insert;
  const originalComplete = trips.complete;
  const originalRecord = activity.record;

  try {
    db.enabled = () => true;
    fishers.findByRfid = async () => ({ fisher_id: 'f-123', full_name: 'Test Fisher' });

    let activeTrip = null;
    trips.findActiveByFisher = async () => activeTrip;
    trips.insert = async ({ fisherId, checkinAt }) => {
      activeTrip = { trip_id: 'trip-1', fisher_id: fisherId, checkin_at: checkinAt, status: 'active' };
      return activeTrip;
    };
    trips.complete = async (tripId, checkoutAt) => {
      activeTrip = { ...activeTrip, trip_id: tripId, checkout_at: checkoutAt, status: 'completed' };
      return activeTrip;
    };
    activity.record = () => {};

    const firstScan = await tripService.processRfid({ uid: '0xA1B2C3D4', event: 'checkin' });
    assert.equal(firstScan.persisted, true);
    assert.equal(firstScan.event, 'checkin');

    const secondScan = await tripService.processRfid({ uid: '0xA1B2C3D4', event: 'scan' });
    assert.equal(secondScan.persisted, false);
    assert.equal(secondScan.note, 'already-checked-in');
    assert.equal(secondScan.event, 'scan');

    const checkout = await tripService.processRfid({ uid: '0xA1B2C3D4', event: 'checkout' });
    assert.equal(checkout.persisted, true);
    assert.equal(checkout.event, 'checkout');
  } finally {
    db.enabled = originalEnabled;
    fishers.findByRfid = originalFindByRfid;
    trips.findActiveByFisher = originalFindActiveByFisher;
    trips.insert = originalInsert;
    trips.complete = originalComplete;
    activity.record = originalRecord;
  }
});

test('a bare UID is treated as a scan and does not mutate trip state', async () => {
  const originalEnabled = db.enabled;
  const originalFindByRfid = fishers.findByRfid;
  const originalFindActiveByFisher = trips.findActiveByFisher;
  const originalInsert = trips.insert;
  const originalRecord = activity.record;

  try {
    db.enabled = () => true;
    fishers.findByRfid = async () => ({ fisher_id: 'f-123', full_name: 'Test Fisher' });

    let insertionCount = 0;
    trips.findActiveByFisher = async () => ({ trip_id: 'trip-1', status: 'active' });
    trips.insert = async () => {
      insertionCount += 1;
      return { trip_id: 'trip-new', status: 'active' };
    };
    activity.record = () => {};

    const result = await tripService.processRfid({ uid: '0xA1B2C3D4', event: 'scan' });
    assert.equal(result.persisted, false);
    assert.equal(result.event, 'scan');
    assert.equal(insertionCount, 0);
  } finally {
    db.enabled = originalEnabled;
    fishers.findByRfid = originalFindByRfid;
    trips.findActiveByFisher = originalFindActiveByFisher;
    trips.insert = originalInsert;
    activity.record = originalRecord;
  }
});

test('registering the same holder with the same name and phone does not create a new fisher row', async () => {
  const originalQuery = db.query;

  try {
    db.query = async (text) => {
      if (text.includes('FROM fishers') && text.includes('WHERE upper(rfid_id)')) {
        return {
          rows: [{
            fisher_id: 'f-123',
            full_name: 'Jane Doe',
            phone_number: '+1 555 123 4567',
            rfid_id: 'A1B2',
            created_at: new Date().toISOString()
          }]
        };
      }

      if (text.includes('INSERT INTO fishers')) {
        return {
          rows: [{
            fisherId: 'new-fisher-id',
            uid: 'A1B2',
            name: 'Jane Doe',
            phone: '+1 555 123 4567',
            createdAt: new Date().toISOString()
          }]
        };
      }

      return { rows: [] };
    };

    const card = await fishers.upsertByRfid({
      rfid: '0xA1B2',
      name: '  Jane Doe  ',
      phone: '+1 555 123 4567',
      operatorId: '00000000-0000-0000-0000-000000000001'
    });

    assert.equal(card.fisherId, 'f-123');
    assert.equal(card.uid, 'A1B2');
  } finally {
    db.query = originalQuery;
  }
});

test('listWithStatus hides Jane Doe placeholder rows from the registered cards list', async () => {
  const originalQuery = db.query;

  try {
    db.query = async () => ({
      rows: [
        { fisherId: 'real-user', uid: 'A1B2', name: 'Real Fisher', phone: '+1 555 0001', createdAt: new Date().toISOString(), status: 'CHECKED OUT', lastActivity: new Date().toISOString() },
        { fisherId: 'placeholder-user', uid: '99ZZ', name: 'Jane Doe', phone: '+1 555 0002', createdAt: new Date().toISOString(), status: 'CHECKED OUT', lastActivity: new Date().toISOString() }
      ]
    });

    const cards = await fishers.listWithStatus();
    assert.deepEqual(cards.map((card) => card.name), ['Real Fisher']);
  } finally {
    db.query = originalQuery;
  }
});

test('manual pairing creates an active trip only after the save pairing action', async () => {
  const originalUpsertByRfid = fishers.upsertByRfid;
  const originalFindActiveByFisher = trips.findActiveByFisher;
  const originalInsert = trips.insert;
  const originalPublish = require('../src/events/eventBus').publish;

  try {
    fishers.upsertByRfid = async () => ({ fisherId: 'f-456', uid: '0xABCDEF12', name: 'Manual Pair', phone: '+1 555 0100' });
    trips.findActiveByFisher = async () => null;
    trips.insert = async ({ fisherId, checkinAt }) => ({ trip_id: 'trip-manual', fisher_id: fisherId, checkin_at: checkinAt, status: 'active' });
    require('../src/events/eventBus').publish = () => {};

    const result = await require('../src/services/cardsService').registerCard({
      uid: '0xABCDEF12',
      name: 'Manual Pair',
      phone: '+1 555 0100',
      operatorId: '00000000-0000-0000-0000-000000000001'
    });

    assert.equal(result.fisherId, 'f-456');
    assert.equal(result.uid, '0xABCDEF12');
  } finally {
    fishers.upsertByRfid = originalUpsertByRfid;
    trips.findActiveByFisher = originalFindActiveByFisher;
    trips.insert = originalInsert;
    require('../src/events/eventBus').publish = originalPublish;
  }
});
