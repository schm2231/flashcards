(function () {
  'use strict';

  // ---------- storage (never throws) ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
    },
  };

  const KEYS = { sheet: 'fc.sheetId', library: 'fc.library', progress: 'fc.progress', sessionSize: 'fc.sessionSize' };

  let library = store.get(KEYS.library, null);
  let progress = store.get(KEYS.progress, {});

  // ---------- helpers ----------
  const $app = document.getElementById('app');
  const $title = document.getElementById('title');
  const $back = document.getElementById('back');
  const $settingsBtn = document.getElementById('settings-btn');

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function stats(card) {
    return progress[card.id] || { c: 0, w: 0, streak: 0, last: 0 };
  }

  function record(card, correct) {
    const s = { ...stats(card) };
    if (correct) { s.c++; s.streak++; } else { s.w++; s.streak = 0; }
    s.last = Date.now();
    progress[card.id] = s;
    store.set(KEYS.progress, progress);
  }

  function boxStats(box) {
    let c = 0, w = 0, seen = 0;
    for (const card of box.cards) {
      const s = progress[card.id];
      if (s && (s.c || s.w)) { seen++; c += s.c; w += s.w; }
    }
    return { seen, accuracy: c + w ? Math.round((100 * c) / (c + w)) : null };
  }

  function setChrome(title, showBack) {
    $title.textContent = title;
    $back.hidden = !showBack;
  }

  // ---------- navigation (so Android's back button works) ----------
  function go(view, data, replace) {
    const state = { view, data };
    if (replace) history.replaceState(state, '');
    else history.pushState(state, '');
    render(state);
  }

  window.addEventListener('popstate', (e) => render(e.state || { view: 'home' }));
  $back.addEventListener('click', () => history.back());
  $settingsBtn.addEventListener('click', () => go('settings'));

  function render(state) {
    const views = { home: renderHome, settings: renderSettings, study: renderStudyStart };
    (views[state.view] || renderHome)(state.data);
  }

  // ---------- home ----------
  async function refresh() {
    const id = store.get(KEYS.sheet, null);
    if (!id) return;
    const btn = document.getElementById('refresh');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    try {
      library = await Sheets.loadLibrary(id);
      store.set(KEYS.library, library);
      renderHome();
    } catch (e) {
      renderHome(e.message);
    }
  }

  function renderHome(errorMsg) {
    setChrome('Boxes', false);
    const id = store.get(KEYS.sheet, null);
    if (!id) return renderSettings(null, true);

    const err = typeof errorMsg === 'string' ? errorMsg : null;
    if (!library || library.sheetId !== id) {
      $app.innerHTML = `<p class="muted center">Loading your boxes…</p>`;
      if (!err) { refresh(); return; }
    }

    const boxes = (library && library.sheetId === id) ? library.boxes : [];
    const items = boxes.map((b, i) => {
      const s = boxStats(b);
      const meta = b.error
        ? `<span class="bad">${esc(b.error)}</span>`
        : `${b.cards.length} card${b.cards.length === 1 ? "" : "s"} · ${s.seen} studied${s.accuracy == null ? '' : ` · ${s.accuracy}% correct`}`;
      return `<li><button class="box" data-i="${i}" ${b.error || !b.cards.length ? 'disabled' : ''}>
          <span class="box-name">${esc(b.name)}</span>
          ${b.description ? `<span class="box-desc">${esc(b.description)}</span>` : ''}
          <span class="box-meta">${meta}</span>
        </button></li>`;
    }).join('');

    const when = library && library.sheetId === id ? new Date(library.fetchedAt).toLocaleString() : 'never';
    $app.innerHTML = `
      ${err ? `<div class="banner bad">${esc(err)}</div>` : ''}
      ${boxes.length ? `<ul class="boxes">${items}</ul>` : (err ? '' : '<p class="muted center">No active boxes. Add rows to the Boxes tab in your sheet.</p>')}
      <div class="row">
        <button id="refresh" class="secondary">Refresh from sheet</button>
      </div>
      <p class="muted small center">Last synced ${esc(when)}</p>`;

    $app.querySelectorAll('.box').forEach((el) => {
      el.addEventListener('click', () => go('study', { box: Number(el.dataset.i) }));
    });
    document.getElementById('refresh').addEventListener('click', refresh);
  }

  // ---------- settings ----------
  function renderSettings(_data, firstRun) {
    setChrome(firstRun ? 'Set up' : 'Settings', !firstRun);
    const id = store.get(KEYS.sheet, '');
    const size = store.get(KEYS.sessionSize, 20);
    $app.innerHTML = `
      <form id="settings" class="stack">
        ${firstRun ? '<p>Paste the link to your Google Sheet. It must be shared as <b>Anyone with the link: Viewer</b>.</p>' : ''}
        <label>Google Sheet link
          <input id="sheet" type="url" inputmode="url" autocomplete="off" placeholder="https://docs.google.com/spreadsheets/d/…" value="${id ? `https://docs.google.com/spreadsheets/d/${esc(id)}/edit` : ''}">
        </label>
        <label>Cards per session
          <select id="size">
            ${[10, 20, 30, 50, 0].map((n) => `<option value="${n}" ${n === size ? 'selected' : ''}>${n || 'All'}</option>`).join('')}
          </select>
        </label>
        <p id="settings-error" class="bad" hidden></p>
        <button type="submit" class="primary">Save</button>
      </form>
      ${firstRun ? '' : `
      <hr>
      <div class="stack">
        <button id="reset" class="danger">Reset all progress</button>
        <p class="muted small">Progress is stored on this phone only.</p>
      </div>`}`;

    document.getElementById('settings').addEventListener('submit', (e) => {
      e.preventDefault();
      const newId = Sheets.sheetIdFrom(document.getElementById('sheet').value);
      const errEl = document.getElementById('settings-error');
      if (!newId) {
        errEl.textContent = "That doesn't look like a Google Sheets link.";
        errEl.hidden = false;
        return;
      }
      store.set(KEYS.sessionSize, Number(document.getElementById('size').value));
      const changed = newId !== store.get(KEYS.sheet, null);
      store.set(KEYS.sheet, newId);
      if (changed) library = null;
      if (firstRun) go('home', null, true);
      else history.back();
    });

    const reset = document.getElementById('reset');
    if (reset) {
      let armed = false;
      reset.addEventListener('click', () => {
        if (!armed) { armed = true; reset.textContent = 'Tap again to erase all progress'; return; }
        progress = {};
        store.set(KEYS.progress, progress);
        reset.textContent = 'Progress erased';
        reset.disabled = true;
      });
    }
  }

  // ---------- study ----------
  let session = null;

  function pickCards(box, size) {
    // Until spaced repetition lands: unseen and weakest cards first, random among equals.
    const scored = shuffle(box.cards.slice()).map((card) => {
      const s = stats(card);
      const total = s.c + s.w;
      const score = total === 0 ? -1 : s.c / total + Math.min(s.streak, 5) * 0.05;
      return { card, score };
    });
    scored.sort((a, b) => a.score - b.score);
    const chosen = (size ? scored.slice(0, size) : scored).map((x) => x.card);
    return shuffle(chosen);
  }

  function renderStudyStart(data) {
    const box = library && library.boxes[data && data.box];
    if (!box) return go('home', null, true);
    session = {
      box,
      queue: pickCards(box, store.get(KEYS.sessionSize, 20)),
      idx: 0,
      results: [],
    };
    renderCard();
  }

  function startWith(cards) {
    session = { box: session.box, queue: shuffle(cards.slice()), idx: 0, results: [] };
    renderCard();
  }

  function renderCard() {
    const { box, queue, idx } = session;
    if (idx >= queue.length) return renderSummary();
    const card = queue[idx];
    setChrome(box.name, true);
    const isSelf = card.grading === 'self';

    $app.innerHTML = `
      <div class="progress"><div style="width:${(100 * idx) / queue.length}%"></div></div>
      <p class="muted small">${idx + 1} of ${queue.length}</p>
      <div class="card">
        <div class="prompt">${esc(card.prompt)}</div>
        ${card.hint ? `<button id="hint-btn" class="link">Show hint</button><div id="hint" class="hint" hidden>${esc(card.hint)}</div>` : ''}
      </div>
      ${isSelf ? `
        <p class="muted small center">Say or think your answer, then reveal it.</p>
        <button id="reveal" class="primary">Show answer</button>
      ` : `
        <form id="answer-form" class="stack">
          <input id="answer" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            lang="${esc(box.lang)}" enterkeyhint="done" placeholder="Type your answer" aria-label="Your answer">
          <button type="submit" class="primary">Check</button>
          <button type="button" id="dunno" class="secondary">I don't know</button>
        </form>
      `}
      <div id="feedback"></div>`;

    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn) hintBtn.addEventListener('click', () => {
      document.getElementById('hint').hidden = false;
      hintBtn.remove();
    });

    if (isSelf) {
      document.getElementById('reveal').addEventListener('click', () => showSelfGrade(card));
    } else {
      const input = document.getElementById('answer');
      input.focus();
      document.getElementById('answer-form').addEventListener('submit', (e) => {
        e.preventDefault();
        showResult(card, input.value, Grading.grade(input.value, [card.answer, ...card.alts]));
      });
      document.getElementById('dunno').addEventListener('click', () => {
        showResult(card, '', { correct: false, kind: 'empty', matched: card.answer });
      });
    }
  }

  function showSelfGrade(card) {
    document.getElementById('reveal').remove();
    const fb = document.getElementById('feedback');
    fb.innerHTML = `
      <div class="answer-box">${esc(card.answer)}</div>
      <div class="row two">
        <button id="missed" class="danger">Missed it</button>
        <button id="got" class="good">Got it</button>
      </div>`;
    document.getElementById('got').addEventListener('click', () => advance(card, true, ''));
    document.getElementById('missed').addEventListener('click', () => advance(card, false, ''));
  }

  const NOTES = {
    exact: '',
    accent: 'Check your accents.',
    article: 'Check the article.',
    typo: 'Close enough, but check the spelling.',
    wrong: '',
    empty: '',
  };

  function showResult(card, typed, result) {
    const form = document.getElementById('answer-form');
    form.querySelector('input').disabled = true;
    form.querySelectorAll('button').forEach((el) => { el.hidden = true; });
    let correct = result.correct;
    const fb = document.getElementById('feedback');

    function paint() {
      const showAnswer = !correct || result.kind !== 'exact';
      fb.innerHTML = `
        <div class="verdict ${correct ? 'good' : 'bad'}">${correct ? 'Correct' : 'Not quite'}</div>
        ${typed ? `<p class="small">You said: <b>${esc(typed)}</b></p>` : ''}
        ${showAnswer ? `<div class="answer-box">${esc(card.answer)}</div>` : ''}
        ${card.alts.length && showAnswer ? `<p class="muted small">Also accepted: ${card.alts.map(esc).join(', ')}</p>` : ''}
        ${correct && NOTES[result.kind] ? `<p class="small">${NOTES[result.kind]}</p>` : ''}
        <div class="row two">
          <button id="override" class="secondary">${correct ? 'Count it wrong' : 'I was right'}</button>
          <button id="next" class="primary">Next</button>
        </div>`;
      document.getElementById('override').addEventListener('click', () => { correct = !correct; paint(); });
      const next = document.getElementById('next');
      next.addEventListener('click', () => advance(card, correct, typed));
      next.focus();
    }
    paint();
  }

  function advance(card, correct, typed) {
    record(card, correct);
    session.results.push({ card, correct, typed });
    session.idx++;
    renderCard();
  }

  function renderSummary() {
    const { box, results } = session;
    setChrome(box.name, true);
    const right = results.filter((r) => r.correct).length;
    const missed = results.filter((r) => !r.correct);
    $app.innerHTML = `
      <div class="summary">
        <div class="score">${right} / ${results.length}</div>
        <p class="muted center">${results.length ? Math.round((100 * right) / results.length) : 0}% correct</p>
      </div>
      ${missed.length ? `
        <h2>Missed</h2>
        <ul class="missed">${missed.map((r) => `<li><span>${esc(r.card.prompt)}</span><b>${esc(r.card.answer)}</b></li>`).join('')}</ul>
        <button id="retry" class="primary">Study missed cards again</button>` : '<p class="center">Clean sweep.</p>'}
      <button id="again" class="secondary">New session</button>
      <button id="home" class="secondary">Back to boxes</button>`;
    const retry = document.getElementById('retry');
    if (retry) retry.addEventListener('click', () => startWith(missed.map((r) => r.card)));
    document.getElementById('again').addEventListener('click', () => {
      session = { box, queue: pickCards(box, store.get(KEYS.sessionSize, 20)), idx: 0, results: [] };
      renderCard();
    });
    document.getElementById('home').addEventListener('click', () => history.back());
  }

  // ---------- boot ----------
  history.replaceState({ view: 'home' }, '');
  renderHome();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
