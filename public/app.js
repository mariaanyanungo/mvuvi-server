(() => {
  'use strict';

  const PENDING_MS = 10000;

  const NOTE_TEXT = {
    unassigned: 'Card is unassigned',
    'checkout-ignored': 'Checkout ignored: card is unassigned',
    'already-checked-in': 'Already checked in (ignored)',
    'already-unassigned': 'Card is unassigned',
    'no-active-trip': 'No active trip found',
    'database-error': 'Database error',
    'last-known-location': 'Used last known location',
    'no-location': 'No location available',
    duplicate: 'Duplicate alert ignored',
    'scan-only': 'Scan recorded'
  };

  const state = {
    active: null,
    cards: [],
    events: [],
    filter: 'all',
    selectedFisher: null,    // { fisherId, name, phone, checkedIn }
    pending: null,
    lastEventKey: null,
    eventsLoaded: false,
    flash: null,
    fisherResults: [],
    searchToken: 0
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    activeUid: $('activeUid'),
    activeTags: $('activeTags'),
    activeTimestamp: $('activeTimestamp'),
    activeMessage: $('activeMessage'),
    activeNotice: $('activeNotice'),

    form: $('pairForm'),
    fisherSearch: $('fisherSearch'),
    fisherResults: $('fisherResults'),
    fisherIdInput: $('fisherIdInput'),
    name: $('nameInput'),
    phone: $('phoneInput'),
    totalFishers: $('totalFishersInput'),
    submit: $('submitButton'),
    hint: $('pairHint'),

    fisherForm: $('fisherForm'),
    newFisherName: $('newFisherName'),
    newFisherPhone: $('newFisherPhone'),
    fisherSubmit: $('fisherSubmit'),
    fisherHint: $('fisherHint'),

    registerCardEmpty: $('registerCardEmpty'),
    registerCardBody: $('registerCardBody'),
    registerCardUid: $('registerCardUid'),
    registerCardSubmit: $('registerCardSubmit'),
    registerCardHint: $('registerCardHint'),

    filter: $('cardFilter'),
    cardsBody: $('cardsTableBody'),
    feed: $('activityFeed')
  };

  /* ---------- helpers ---------- */

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
    String(status || '').toUpperCase() === 'CHECKED IN'
      ? tag('Checked in', 'in')
      : tag('Checked out', 'out');

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
      renderRegisterCard();
      return;
    }

    els.activeUid.textContent = a.uid;
    els.activeTimestamp.textContent = `Scanned ${fmt(a.scannedAt)}`;

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
      els.activeMessage.textContent = 'Unassigned: search a fisher, enter total count, then Save Pair.';
      els.activeMessage.hidden = false;
    }

    renderRegisterCard();
  }

  /* ---------- Register Card panel ---------- */

  function renderRegisterCard() {
    const uid = state.active && state.active.uid;
    if (!uid) {
      els.registerCardEmpty.hidden = false;
      els.registerCardBody.hidden = true;
      els.registerCardUid.value = '';
      return;
    }
    els.registerCardEmpty.hidden = true;
    els.registerCardBody.hidden = false;
    els.registerCardUid.value = uid;
    els.registerCardHint.textContent = 'Card will be added with status "unassigned" if it does not exist yet.';
    els.registerCardHint.className = 'hint';
  }

  els.registerCardSubmit.addEventListener('click', async () => {
    const uid = els.registerCardUid.value.trim();
    if (!uid) return;
    els.registerCardSubmit.disabled = true;
    els.registerCardHint.textContent = 'Registering…';
    els.registerCardHint.className = 'hint';

    try {
      const response = await fetch('/api/cards/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid })
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        els.registerCardHint.textContent = body.error || `Server error (${response.status})`;
        els.registerCardHint.className = 'hint hint--error';
        return;
      }

      // body.message is set by the backend: "registered successfully" vs "already registered"
      els.registerCardHint.textContent = body.message || `Card ${body.uid} ready.`;
      els.registerCardHint.className = body.wasCreated ? 'hint hint--success' : 'hint';
      await loadCards();
    } catch (err) {
      els.registerCardHint.textContent = 'Cannot reach the server.';
      els.registerCardHint.className = 'hint hint--error';
    } finally {
      els.registerCardSubmit.disabled = false;
    }
  });

  /* ---------- Fisher search combobox ---------- */

  function closeResults() {
    els.fisherResults.hidden = true;
    els.fisherResults.replaceChildren();
  }

  function renderResults() {
    const list = state.fisherResults;
    if (!list.length) {
      const li = h('li', 'empty', 'No matching fishers');
      els.fisherResults.replaceChildren(li);
      els.fisherResults.hidden = false;
      return;
    }
    els.fisherResults.replaceChildren(
      ...list.map((f) => {
        const li = h('li');
        li.tabIndex = 0;
        const top = h('div', null, `${f.name}${f.checkedIn ? '  •  checked in' : ''}`);
        const meta = h('div', 'meta', f.phone + (f.uid ? `  ·  ${f.uid}` : ''));
        li.append(top, meta);
        li.addEventListener('mousedown', (event) => {
          event.preventDefault();
          selectFisher(f);
        });
        return li;
      })
    );
    els.fisherResults.hidden = false;
  }

  function selectFisher(f) {
    if (f.checkedIn) {
      state.flash = { text: `${f.name} is already checked in with another card.`, kind: 'error' };
      updateSubmitState();
      closeResults();
      return;
    }
    state.selectedFisher = f;
    state.flash = null;
    els.fisherSearch.value = f.name;
    els.fisherIdInput.value = f.fisherId;
    els.name.value = f.name;
    els.phone.value = f.phone || '';
    closeResults();
    updateSubmitState();
  }

  let searchTimer = null;
  els.fisherSearch.addEventListener('input', () => {
    state.selectedFisher = null;
    els.fisherIdInput.value = '';
    els.name.value = '';
    els.phone.value = '';
    state.flash = null;
    updateSubmitState();

    clearTimeout(searchTimer);
    const q = els.fisherSearch.value.trim();
    searchTimer = setTimeout(() => runSearch(q), 180);
  });

  els.fisherSearch.addEventListener('focus', () => {
    if (els.fisherSearch.value.trim() !== '' || state.fisherResults.length) {
      renderResults();
    }
  });

  els.fisherSearch.addEventListener('blur', () => {
    setTimeout(closeResults, 150);
  });

  async function runSearch(q) {
    const token = ++state.searchToken;
    try {
      const url = q ? `/api/fishers?search=${encodeURIComponent(q)}` : '/api/fishers';
      const response = await fetch(url);
      const body = await response.json().catch(() => []);
      if (token !== state.searchToken) return;
      if (!response.ok) {
        console.error('[SEARCH] /api/fishers failed:', response.status, body);
        state.fisherResults = [];
        renderResults();
        return;
      }
      state.fisherResults = Array.isArray(body) ? body : [];
      renderResults();
    } catch (err) {
      if (token !== state.searchToken) return;
      console.error('[SEARCH] network error:', err);
      state.fisherResults = [];
      renderResults();
    }
  }

  /* ---------- Pair form ---------- */

  function setFlash(text, kind) {
    state.flash = text ? { text, kind } : null;
    updateSubmitState();
  }

  function fisherCountValue() {
    const n = parseInt(els.totalFishers.value, 10);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }

  function updateSubmitState() {
    const hasActive = !!(state.active && state.active.uid);
    const hasFisher = !!state.selectedFisher;
    const hasCount = fisherCountValue() !== null;

    els.submit.disabled = !(hasActive && hasFisher && hasCount);

    let text;
    let kind = '';
    if (state.flash) {
      ({ text, kind } = state.flash);
    } else if (!hasActive) {
      text = 'Scan a card first';
    } else if (!hasFisher) {
      text = 'Search and select a fisher';
    } else if (!hasCount) {
      text = 'Enter the total fisher count';
    } else {
      text = 'Ready to save';
    }
    els.hint.textContent = text;
    els.hint.className = kind ? `hint hint--${kind}` : 'hint';
  }

  els.totalFishers.addEventListener('input', () => setFlash(null));

  els.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (els.submit.disabled) return;
    if (!state.active || !state.active.uid) return;
    if (!state.selectedFisher) return;
    els.submit.disabled = true;

    try {
      const response = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: state.active.uid,
          fisherId: state.selectedFisher.fisherId,
          totalFishers: fisherCountValue()
        })
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFlash(body.error || 'Could not save the pairing.', 'error');
        return;
      }

      state.selectedFisher = null;
      els.fisherSearch.value = '';
      els.fisherIdInput.value = '';
      els.name.value = '';
      els.phone.value = '';
      els.totalFishers.value = '';

      setFlash(`${body.name || 'The fisher'} is now checked in with card ${body.uid}.`, 'success');
      await loadCards();
    } catch (err) {
      setFlash('Cannot reach the server.', 'error');
    } finally {
      updateSubmitState();
    }
  });

  /* ---------- Register Fisher ---------- */

  els.fisherForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    els.fisherSubmit.disabled = true;
    els.fisherHint.textContent = 'Registering…';
    els.fisherHint.className = 'hint';

    try {
      const response = await fetch('/api/fishers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: els.newFisherName.value.trim(),
          phone: els.newFisherPhone.value.trim()
        })
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Show the real server message, never a generic "Not found"
        els.fisherHint.textContent = body.error || `Server error (${response.status})`;
        els.fisherHint.className = 'hint hint--error';
        return;
      }
      els.fisherHint.textContent = `${body.name} registered. They can now be selected in the search.`;
      els.fisherHint.className = 'hint hint--success';
      els.newFisherName.value = '';
      els.newFisherPhone.value = '';
      els.newFisherName.focus();
    } catch (err) {
      els.fisherHint.textContent = 'Cannot reach the server.';
      els.fisherHint.className = 'hint hint--error';
    } finally {
      els.fisherSubmit.disabled = false;
    }
  });

  /* ---------- Cards table ---------- */

  function renderCards() {
    const rows = state.cards.filter((c) => state.filter === 'all' || c.cardStatus === state.filter);
    if (rows.length === 0) {
      emptyRow(els.cardsBody, 6, state.cards.length ? 'No cards match this filter' : 'No cards yet. Scan a card to see it here.');
      return;
    }

    els.cardsBody.replaceChildren(
      ...rows.map((card) => {
        const assigned = card.cardStatus === 'assigned';

        const status = h('div', 'cell-tags');
        status.appendChild(fisherStatusTag(assigned ? 'CHECKED IN' : 'CHECKED OUT'));
        if (isPending(card.uid)) status.appendChild(tag('Waiting for checkout', 'wait'));

        const name = assigned && card.name ? card.name : '-';
        const phone = assigned && card.phone ? card.phone : '-';

        const tr = h('tr');
        tr.append(
          cell(name, name === '-' ? 'muted' : ''),
          cell(phone, phone === '-' ? 'muted' : ''),
          cell(card.uid, 'mono'),
          cell(cardStatusTag(card.cardStatus)),
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

  function handleEvents(list) {
    state.events = Array.isArray(list) ? list : [];
    const latest = state.events[0];

    if (latest) {
      const key = `${latest.timestamp}|${latest.uid}|${latest.event}`;
      if (key !== state.lastEventKey) {
        state.lastEventKey = key;

        if (latest.event === 'scan' && latest.cardStatus === 'assigned' && !latest.note) {
          const startedAt = state.eventsLoaded ? Date.now() : Date.parse(latest.timestamp);
          if (startedAt + PENDING_MS > Date.now()) {
            state.pending = { uid: latest.uid, until: startedAt + PENDING_MS };
            schedulePendingExpiry();
          }
        } else if (state.pending && state.pending.uid === latest.uid) {
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
      renderActive();
      updateSubmitState();
    } catch (err) {
      console.warn('Could not load cards:', err.message);
    }
  }

  // IMPORTANT: never auto-fill the pair form from the active card's holder.
  // The operator must explicitly search + select a fisher.
  function clearPairForm() {
    state.selectedFisher = null;
    els.fisherSearch.value = '';
    els.fisherIdInput.value = '';
    els.name.value = '';
    els.phone.value = '';
    els.totalFishers.value = '';
    state.flash = null;
    closeResults();
  }

  function handleActive(active) {
    const before = state.active ? `${state.active.uid}|${state.active.scannedAt}` : null;
    state.active = active && active.uid ? active : null;
    const after = state.active ? `${state.active.uid}|${state.active.scannedAt}` : null;

    if (after !== before) {
      // Every new scan fully clears the pair form.
      clearPairForm();
      if (state.active) els.fisherSearch.focus();
    }
    renderActive();
    updateSubmitState();
  }

  const socket = io();
  socket.on('activeCard', handleActive);
  socket.on('cards', (list) => {
    state.cards = (Array.isArray(list) ? list : []).map(normalizeCard);
    renderCards();
    renderActive();
    updateSubmitState();
  });
  socket.on('events', handleEvents);

  // Reset the pair form on first load, in case the server has a stale active card.
  clearPairForm();
  renderActive();
  renderCards();
  renderFeed();
  updateSubmitState();
  loadCards();
})();