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

  function record(card, correct) {
    progress[card.id] = SRS.review(progress[card.id], correct, Date.now());
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
  const onHome = () => (history.state || {}).view === 'home';

  // quiet = background refresh on app open: never interrupts a study session, keeps the saved copy on failure.
  async function refresh(quiet) {
    const id = store.get(KEYS.sheet, null);
    if (!id) return;
    const btn = document.getElementById('refresh');
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
    try {
      const fresh = await Sheets.loadLibrary(id);
      if (store.get(KEYS.sheet, null) !== id) return; // sheet changed while loading
      library = fresh;
      store.set(KEYS.library, library);
      if (!quiet || onHome()) renderHome();
    } catch (e) {
      if (!quiet || onHome()) renderHome(quiet && library ? `Couldn't sync, showing your saved cards. (${e.message})` : e.message);
    }
  }

  function renderHome(errorMsg) {
    setChrome('Boxes', false);
    const id = store.get(KEYS.sheet, null);
    if (!id) return renderSettings(null, true);

    const err = typeof errorMsg === 'string' ? errorMsg : null;
    if (!library || library.sheetId !== id) {
      $app.innerHTML = `<p class="muted center">Loading your boxes…</p>`;
      if (!err) { refresh(false); return; }
    }

    const boxes = (library && library.sheetId === id) ? library.boxes : [];
    const items = boxes.map((b, i) => {
      const s = boxStats(b);
      const q = SRS.counts(b.cards, progress, Date.now());
      const todo = q.due || q.fresh
        ? `<span class="pill">${q.due} due</span><span class="pill new">${q.fresh} new</span>`
        : `<span class="pill done">Caught up${q.nextDue ? ` · next ${SRS.describeWait(q.nextDue - Date.now())}` : ''}</span>`;
      const meta = b.error
        ? `<span class="bad">${esc(b.error)}</span>`
        : `<span class="pills">${todo}</span>${b.cards.length} card${b.cards.length === 1 ? '' : 's'}${s.accuracy == null ? '' : ` · ${s.accuracy}% correct overall`}`;
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
    document.getElementById('refresh').addEventListener('click', () => refresh(false));
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

  function newSession(box) {
    const { cards, ahead } = SRS.pick(box.cards, progress, store.get(KEYS.sessionSize, 20), Date.now());
    session = { box, queue: shuffle(cards), idx: 0, results: [], ahead, practice: false };
    renderCard();
  }

  function renderStudyStart(data) {
    const box = library && library.boxes[data && data.box];
    if (!box) return go('home', null, true);
    newSession(box);
  }

  // Practice rounds (re-studying misses) don't touch spaced repetition or the counts.
  function startPractice(cards) {
    session = { box: session.box, queue: shuffle(cards.slice()), idx: 0, results: [], ahead: false, practice: true };
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
      <p class="muted small">${idx + 1} of ${queue.length}${session.practice ? ' · practice, not scored' : session.ahead ? ' · nothing due, reviewing ahead' : ''}</p>
      <div class="card">
        <div class="prompt">${esc(card.prompt)}</div>
        ${card.hint ? `<button id="hint-btn" class="link">Show hint</button><div id="hint" class="hint" hidden>${esc(card.hint)}</div>` : ''}
      </div>
      ${isSelf ? `
        <p class="muted small center">Say or think your answer, then reveal it.</p>
        <button id="reveal" class="primary">Show answer</button>
      ` : `
        <form id="answer-form" class="stack">
          <div class="answer-row">
            <input id="answer" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
              lang="${esc(box.lang)}" enterkeyhint="done" placeholder="${Voice.supported ? 'Type or tap the mic' : 'Type your answer'}" aria-label="Your answer">
            ${Voice.supported ? '<button type="button" id="mic" class="mic" aria-label="Speak your answer">&#127908;</button>' : ''}
          </div>
          <p id="voice-status" class="muted small" hidden></p>
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
      if (!Voice.supported) input.focus();
      const mic = document.getElementById('mic');
      if (mic) mic.addEventListener('click', () => listenFor(card, box.lang, input, mic));
      document.getElementById('answer-form').addEventListener('submit', (e) => {
        e.preventDefault();
        showResult(card, input.value, Grading.grade(input.value, [card.answer, ...card.alts]));
      });
      document.getElementById('dunno').addEventListener('click', () => {
        showResult(card, '', { correct: false, kind: 'empty', matched: card.answer });
      });
    }
  }

  async function listenFor(card, lang, input, mic) {
    const status = document.getElementById('voice-status');
    if (Voice.active) { Voice.stop(); return; }
    mic.classList.add('listening');
    status.hidden = false;
    status.textContent = 'Listening…';
    try {
      const heard = await Voice.listen(lang, (interim) => { input.value = interim; });
      if (!document.body.contains(mic)) return; // moved on to another card
      const answers = [card.answer, ...card.alts];
      // The recognizer returns several guesses; use the first one that grades as correct.
      const graded = heard.map((h) => ({ h, r: Grading.grade(h, answers) }));
      const best = graded.find((g) => g.r.correct) || graded[0];
      input.value = best.h;
      showResult(card, best.h, best.r, true);
    } catch (e) {
      if (!document.body.contains(mic) || input.disabled) return; // answered by typing instead
      mic.classList.remove('listening');
      status.textContent = e.message;
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

  function showResult(card, typed, result, spoken) {
    Voice.stop();
    const form = document.getElementById('answer-form');
    form.querySelector('input').disabled = true;
    form.querySelectorAll('button').forEach((el) => { el.hidden = true; });
    let correct = result.correct;
    const fb = document.getElementById('feedback');

    function paint() {
      const showAnswer = !correct || result.kind !== 'exact';
      fb.innerHTML = `
        <div class="verdict ${correct ? 'good' : 'bad'}">${correct ? 'Correct' : 'Not quite'}</div>
        ${typed ? `<p class="small">${spoken ? 'You said' : 'You typed'}: <b>${esc(typed)}</b></p>` : ''}
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
    if (!session.practice) record(card, correct);
    session.results.push({ card, correct, typed });
    session.idx++;
    renderCard();
  }

  function nextNote(box) {
    const q = SRS.counts(box.cards, progress, Date.now());
    if (q.due || q.fresh) return `<p class="muted center small">${q.due} due and ${q.fresh} new left in this box.</p>`;
    return `<p class="muted center small">All caught up. Next review ${q.nextDue ? SRS.describeWait(q.nextDue - Date.now()) : 'whenever you like'}.</p>`;
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
      ${session.practice ? '' : nextNote(box)}
      ${missed.length ? `
        <h2>Missed</h2>
        <ul class="missed">${missed.map((r) => `<li><span>${esc(r.card.prompt)}</span><b>${esc(r.card.answer)}</b></li>`).join('')}</ul>
        <button id="retry" class="primary">Study missed cards again</button>` : '<p class="center">Clean sweep.</p>'}
      <button id="again" class="secondary">New session</button>
      <button id="home" class="secondary">Back to boxes</button>`;
    const retry = document.getElementById('retry');
    if (retry) retry.addEventListener('click', () => startPractice(missed.map((r) => r.card)));
    document.getElementById('again').addEventListener('click', () => newSession(box));
    document.getElementById('home').addEventListener('click', () => history.back());
  }

  // ---------- boot ----------
  history.replaceState({ view: 'home' }, '');
  const hadLibrary = !!library;
  renderHome();
  if (hadLibrary && library.sheetId === store.get(KEYS.sheet, null) && navigator.onLine !== false) refresh(true);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
