const fs = require('fs');
const path = require('path');

function ensureDataFile() {
  const dataDir = path.join(__dirname, '..', 'data');
  const dataFile = path.join(dataDir, 'store.json');

  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({ cards: [], events: [] }, null, 2));
  }

  return dataFile;
}

function createDataStore() {
  const dataFile = ensureDataFile();

  function buildStatusMap(events) {
    const statusByUid = {};
    for (const entry of Array.isArray(events) ? events : []) {
      if (!entry || typeof entry.uid !== 'string') {
        continue;
      }

      if (entry.event === 'checkin') {
        statusByUid[entry.uid] = 'CHECKED IN';
      }

      if (entry.event === 'checkout') {
        statusByUid[entry.uid] = 'CHECKED OUT';
      }
    }

    return statusByUid;
  }

  function load() {
    try {
      const raw = fs.readFileSync(dataFile, 'utf8');
      if (!raw.trim()) {
        return { cards: [], events: [], statusByUid: {}, activeCard: null };
      }

      const parsed = JSON.parse(raw);
      const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
      const events = Array.isArray(parsed.events) ? parsed.events : [];

      return {
        cards,
        events,
        statusByUid: buildStatusMap(events),
        activeCard: null
      };
    } catch (error) {
      console.warn('[STORE] Unable to read data file; using defaults.', error.message);
      return { cards: [], events: [], statusByUid: {}, activeCard: null };
    }
  }

  let state = load();

  function save() {
    const payload = {
      cards: state.cards,
      events: state.events
    };

    fs.writeFileSync(dataFile, JSON.stringify(payload, null, 2));
  }

  function normalizeUid(raw) {
    if (typeof raw !== 'string') {
      return null;
    }

    const candidate = raw.trim();
    if (!candidate) {
      return null;
    }

    const withPrefix = candidate.startsWith('0x') || candidate.startsWith('0X')
      ? candidate
      : `0x${candidate}`;

    const normalized = withPrefix.toUpperCase();
    const validLengths = ['8', '14', '20'];
    const len = normalized.length - 2;

    if (!/^0x[0-9A-F]+$/i.test(normalized) || !validLengths.includes(String(len))) {
      return null;
    }

    return `0x${normalized.slice(2)}`;
  }

  function parseIncomingPayload(rawMessage) {
    if (rawMessage === undefined || rawMessage === null) {
      return null;
    }

    const message = Buffer.isBuffer(rawMessage) ? rawMessage.toString() : String(rawMessage);
    const trimmed = message.trim();

    if (!trimmed) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const uid = normalizeUid(parsed.cardId || parsed.uid);
        if (!uid) {
          return null;
        }

        const incomingEvent = typeof parsed.event === 'string' ? parsed.event.trim().toLowerCase() : 'scan';
        if (['checkin', 'checkout', 'scan'].includes(incomingEvent)) {
          return { uid, event: incomingEvent };
        }

        return { uid, event: 'scan' };
      }
    } catch (error) {
    }

    const uid = normalizeUid(trimmed);
    if (!uid) {
      return null;
    }

    return { uid, event: 'scan' };
  }

  function getCurrentStatus(uid) {
    if (!uid) {
      return 'CHECKED OUT';
    }
    return state.statusByUid[uid] || 'CHECKED OUT';
  }

  function getLastActivity(uid) {
    const matching = state.events.filter((entry) => entry.uid === uid);
    if (matching.length === 0) {
      return null;
    }

    return matching[matching.length - 1].timestamp;
  }

  function getCardsWithStatus() {
    return state.cards.map((card) => ({
      ...card,
      status: getCurrentStatus(card.uid),
      lastActivity: getLastActivity(card.uid)
    }));
  }

  function getRecentEvents(limit = 20) {
    return [...state.events].reverse().slice(0, limit);
  }

  function getActiveCard() {
    return state.activeCard ? { ...state.activeCard } : null;
  }

  function recordEvent(parsedMessage) {
    if (!parsedMessage || !parsedMessage.uid) {
      return null;
    }

    const timestamp = new Date().toISOString();
    const eventRecord = {
      uid: parsedMessage.uid,
      event: parsedMessage.event,
      timestamp
    };

    state.events.push(eventRecord);

    if (parsedMessage.event === 'checkin' || parsedMessage.event === 'checkout') {
      state.statusByUid[parsedMessage.uid] = parsedMessage.event === 'checkin' ? 'CHECKED IN' : 'CHECKED OUT';
    }

    const currentActive = state.activeCard;
    const shouldUpdateActive = !currentActive || currentActive.uid !== parsedMessage.uid;

    if (shouldUpdateActive) {
      state.activeCard = {
        uid: parsedMessage.uid,
        scannedAt: timestamp
      };
    }

    save();

    return {
      uid: parsedMessage.uid,
      event: parsedMessage.event,
      timestamp,
      activeChanged: shouldUpdateActive
    };
  }

  function upsertCard(cardData) {
    const uid = normalizeUid(cardData.uid);
    if (!uid) {
      throw new Error('A valid UID is required.');
    }

    const name = String(cardData.name || '').trim();
    if (!name) {
      throw new Error('Name is required.');
    }

    const phone = String(cardData.phone || '').trim();
    const phonePattern = /^[+0-9\s-]+$/;
    if (!phonePattern.test(phone) || !/\d/.test(phone)) {
      throw new Error('Phone number must include digits and may use +, spaces, and dashes.');
    }

    const existingIndex = state.cards.findIndex((card) => card.uid === uid);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      state.cards[existingIndex] = {
        ...state.cards[existingIndex],
        name,
        phone,
        updatedAt: now
      };
      save();
      return state.cards[existingIndex];
    }

    const createdCard = {
      uid,
      name,
      phone,
      createdAt: now
    };

    state.cards.push(createdCard);
    save();
    return createdCard;
  }

  return {
    normalizeUid,
    parseIncomingPayload,
    recordEvent,
    upsertCard,
    getCardsWithStatus,
    getRecentEvents,
    getActiveCard,
    getCurrentStatus,
    getLastActivity,
    state
  };
}

module.exports = { createDataStore };
