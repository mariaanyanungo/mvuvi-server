(() => {
  'use strict';

  // How long the dashboard shows "Waiting for checkout button". Same window as
  // CHECKOUT_TIMEOUT_MS in the ESP32 sketch.
  const PENDING_MS = 10000;

  const NOTE_TEXT = {
    unassigned: 'Card is unassigned',
    'checkout-ignored': 'Checkout ignored: card is unassigned',
    'already-checked-in': 'Already checked in (ignored)',
    'no-active-trip': 'No active trip found',
    'database-error': 'Database error',
    'last-known-location': 'Used last known location',
    'no-location': 'No location available',
    duplicate: 'Duplicate alert ignored'
  };

  const state = {
    active: null,        // { uid, scannedAt, cardStatus, name }
    cards: [],
    events: [],          // newest first
    filter: 'all',
    selectedUid: '',
    userPickedCard: false,
    pending: null,       // { uid, until }
    lastEventKey: null,
    eventsLoaded: false,
    flash: null          // { text, kind } message under the Save button
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    activeUid: $('activeUid'),
    activeTags: $('activeTags'),
    activeTimestamp: $('activeTimestamp'),
    activeMessage: $('activeMessage'),
    activeNotice: $('activeNotice'),
    form: $('pairForm'),
    cardSelect: $('cardSelect'),
    name: $('nameInput'),
    phone: $('phoneInput'),
    submit: $('submitButton'),
    hint: $('pairHint'),
    filter: $('cardFilter'),
    cardsBody: $('cardsTableBody'),
    feed: $('activityFeed')
  };

  /* ---------- helpers (text is always set with textContent, so names cannot inject HTML) ---------- */

  function h(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tag(label, kind) {
    return h('span', `tag tag--${kind}`, label);
  }

  const cardStatusTag = (status) =>
    status === 'assigned' ? tag('Assigned', 'assigned') : tag('Unassigned', 'unassigned');

  const fisherStatusTag = (status) =>
    String(status || '').toUpperCase() === 'CHECKED IN' ? tag('Checked in', 'in') : tag('Checked out', 'out');

  function eventTag(event) {
    switch (String(event || '').toLowerCase()) {
      case 'checkin': return tag('Checkin', 'in');
      case 'checkout': return tag('Checkout', 'out');
      case 'sos': return tag('SOS', 'sos');
      default: return tag('Scan', 'scan');
    }
  }

  function fmt(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
  }

  function cell(content, className) {
    const td = h('td', className);
    if (content instanceof Node) td.appendChild(content);
    else td.textContent = content;
    return td;
  }

  function emptyRow(body, columns, text) {
    const tr = h('tr');
    const td = h('td', 'empty', text);
    td.colSpan = columns;
    tr.appendChild(td);
    body.replaceChildren(tr);
  }

  // The rule: checked in = assigned, checked out = unassigned.
  // A server that sends cardStatus is trusted. An older server that does not is
  // read from the check-in status (never from the name, which checked-out people still have).
  function normalizeCard(card) {
    const checkedIn = String(card.status || '').toUpperCase() === 'CHECKED IN';
    return { ...card, cardStatus: card.cardStatus || (checkedIn ? 'assigned' : 'unassigned') };
  }

  const isPending = (uid) => !!state.pending && state.pending.uid === uid && state.pending.until > Date.now();

  let pendingTimer = null;
  function schedulePendingExpiry() {
    clearTimeout(pendingTimer);
    if (!state.pending) return;
    const wait = Math.max(state.pending.until - Date.now(), 0) + 50;
    pendingTimer = setTimeout(() => {
      state.pending = null;
      renderActive();
      renderCards();
    }, wait);
  }

  /* ---------- Active card ---------- */

  function renderActive() {
    const a = state.active;
    els.activeTags.replaceChildren();
    els.activeMessage.hidden = true;
    els.activeNotice.hidden = true;

    if (!a || !a.uid) {
      els.activeUid.textContent = 'No active card';
      els.activeTimestamp.textContent = 'Waiting for a scan';
      return;
    }

    els.activeUid.textContent = a.uid;
    els.activeTimestamp.textContent = `Scanned ${fmt(a.scannedAt)}`;

    // The cards list is the freshest source for the card's status
    const card = state.cards.find((c) => c.uid === a.uid);
    const cardStatus = card ? card.cardStatus : a.cardStatus;
    const holder = card ? card.name : a.name;

    if (cardStatus === 'assigned') {
      els.activeTags.append(cardStatusTag('assigned'), fisherStatusTag('CHECKED IN'));
      els.activeMessage.textContent = `${holder || 'The holder'} is checked in. Assigned: check out first.`;
      els.activeMessage.hidden = false;
      els.activeNotice.hidden = !isPending(a.uid);
    } else if (cardStatus === 'unassigned') {
      els.activeTags.append(cardStatusTag('unassigned'));
      els.activeMessage.textContent = 'Unassigned: enter a name and phone, then press Save pairing.';
      els.activeMessage.hidden = false;
    }
  }

  /* ---------- Pair form ---------- */

  function setFlash(text, kind) {
    state.flash = text ? { text, kind } : null;
    updateSubmitState();
  }

  function updateSubmitState() {
    const unassigned = state.cards.filter((c) => c.cardStatus === 'unassigned');
    const hasName = els.name.value.trim() !== '';
    const hasPhone = els.phone.value.trim() !== '';

    els.submit.disabled = !(state.selectedUid && hasName && hasPhone);

    let text;
    let kind = '';
    if (state.flash) {
      ({ text, kind } = state.flash);
    } else if (unassigned.length === 0) {
      text = 'Scan a card first';
    } else if (!state.selectedUid) {
      text = 'Select an unassigned card';
    } else if (!hasName || !hasPhone) {
      text = 'Enter a name and phone number';
    } else {
      text = 'Ready to save';
    }
    els.hint.textContent = text;
    els.hint.className = kind ? `hint hint--${kind}` : 'hint';
  }

  function renderCardSelect() {
    const unassigned = state.cards.filter((c) => c.cardStatus === 'unassigned');

    // The card stops being selectable once it is assigned
    if (state.userPickedCard && !unassigned.some((c) => c.uid === state.selectedUid)) {
      state.userPickedCard = false;
    }
    // Follow the latest scanned card unless the operator picked another one
    if (!state.userPickedCard) {
      const scanned = state.active && unassigned.find((c) => c.uid === state.active.uid);
      state.selectedUid = scanned ? scanned.uid : '';
    }

    const options = [];
    const placeholder = h('option', null, unassigned.length ? 'Select a card' : 'No unassigned cards');
    placeholder.value = '';
    options.push(placeholder);
    unassigned.forEach((card) => {
      const option = h('option', null, card.uid);
      option.value = card.uid;
      options.push(option);
    });
    els.cardSelect.replaceChildren(...options);
    els.cardSelect.value = state.selectedUid;
    updateSubmitState();
  }

  els.cardSelect.addEventListener('change', () => {
    state.selectedUid = els.cardSelect.value;
    state.userPickedCard = true;
    setFlash(null);
  });
  [els.name, els.phone].forEach((input) => input.addEventListener('input', () => setFlash(null)));

  els.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (els.submit.disabled) return;
    els.submit.disabled = true;

    try {
      const response = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: state.selectedUid,
          name: els.name.value.trim(),
          phone: els.phone.value.trim()
        })
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFlash(body.error || 'Could not save the pairing.', 'error');
        return;
      }
      els.name.value = '';
      els.phone.value = '';
      state.userPickedCard = false;
      setFlash(`${body.name || 'The fisher'} is now checked in with card ${body.uid}.`, 'success');
      await loadCards();
    } catch (err) {
      setFlash('Cannot reach the server.', 'error');
    } finally {
      updateSubmitState();
    }
  });

  /* ---------- Cards table (grows one row per card) ---------- */

  function renderCards() {
    const rows = state.cards.filter((c) => state.filter === 'all' || c.cardStatus === state.filter);
    if (rows.length === 0) {
      emptyRow(els.cardsBody, 6, state.cards.length ? 'No cards match this filter' : 'No cards yet. Scan a card to see it here.');
      return;
    }

    els.cardsBody.replaceChildren(
      ...rows.map((card) => {
        const assigned = card.cardStatus === 'assigned';

        // Both tags come from the same value, so they can never disagree:
        // assigned = checked in, unassigned = checked out
        const status = h('div', 'cell-tags');
        status.appendChild(fisherStatusTag(assigned ? 'CHECKED IN' : 'CHECKED OUT'));
        if (isPending(card.uid)) status.appendChild(tag('Waiting for checkout', 'wait'));

        const name = assigned && card.name ? card.name : '-';
        const phone = assigned && card.phone ? card.phone : '-';

        const tr = h('tr');
        tr.append(
          cell(card.uid, 'mono'),
          cell(cardStatusTag(card.cardStatus)),
          cell(name, name === '-' ? 'muted' : ''),
          cell(phone, phone === '-' ? 'muted' : ''),
          cell(status),
          cell(fmt(card.lastActivity))
        );
        return tr;
      })
    );
  }

  els.filter.addEventListener('change', () => {
    state.filter = els.filter.value;
    renderCards();
  });

  /* ---------- Recent activity ---------- */

 function renderFeed() {
  if (state.events.length === 0) {
    els.feed.replaceChildren(h('li', 'activity-empty', 'No activity yet'));
    return;
  }

  // Get only the first 5 items from the array
  const recentEvents = state.events.slice(0, 5);

  els.feed.replaceChildren(
    ...recentEvents.map((entry) => {
      const li = h('li', 'activity-item');
      const top = h('div', 'activity-top');
      top.append(eventTag(entry.event), h('span', 'activity-time', fmt(entry.timestamp)));

      const details = [entry.name, NOTE_TEXT[entry.note]].filter(Boolean).join(' · ');
      li.append(top, h('div', 'activity-uid', entry.uid || ''));
      if (details) li.appendChild(h('div', 'activity-meta', details));
      return li;
    })
  );
}


  // Looks at the newest event: a scan on an assigned card means "waiting for the checkout button"
  function handleEvents(list) {
    state.events = Array.isArray(list) ? list : [];
    const latest = state.events[0];

    if (latest) {
      const key = `${latest.timestamp}|${latest.uid}|${latest.event}`;
      if (key !== state.lastEventKey) {
        state.lastEventKey = key;

        if (latest.event === 'scan' && latest.cardStatus === 'assigned' && !latest.note) {
          // A live event counts from now (avoids browser/server clock differences).
          // The first load counts from the event's own time.
          const startedAt = state.eventsLoaded ? Date.now() : Date.parse(latest.timestamp);
          if (startedAt + PENDING_MS > Date.now()) {
            state.pending = { uid: latest.uid, until: startedAt + PENDING_MS };
            schedulePendingExpiry();
          }
        } else if (state.pending && state.pending.uid === latest.uid) {
          // A checkout (or any other result) for that card ends the waiting state
          state.pending = null;
        }
      }
    }
    state.eventsLoaded = true;

    renderFeed();
    renderActive();
    renderCards();
  }

  /* ---------- Loading and live updates ---------- */

  async function getJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  async function loadCards() {
    try {
      state.cards = (await getJson('/api/cards')).map(normalizeCard);
      renderCards();
      renderCardSelect();
      renderActive();
    } catch (err) {
      console.warn('Could not load cards:', err.message);
    }
  }

   function handleActive(active) {
    const before = state.active ? `${state.active.uid}|${state.active.scannedAt}` : null;
    state.active = active && active.uid ? active : null;
    const after = state.active ? `${state.active.uid}|${state.active.scannedAt}` : null;

    if (after !== before) {
      state.userPickedCard = false;  // a new scan takes over the selector

      // A new scan of an unassigned card starts with an empty form for the new person
      if (state.active && state.active.cardStatus === 'unassigned') {
        els.name.value = '';
        els.phone.value = '';
        state.flash = null;
        els.name.focus();
      }
    }
    renderActive();
    renderCardSelect();
  }

  const socket = io();
  socket.on('activeCard', handleActive);
  socket.on('cards', (list) => {
    state.cards = (Array.isArray(list) ? list : []).map(normalizeCard);
    renderCards();
    renderCardSelect();
    renderActive();
  });
  socket.on('events', handleEvents);

  renderActive();
  renderCardSelect();
  renderCards();
  renderFeed();
  loadCards();
})();