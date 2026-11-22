// Spaced repetition. Each correct answer moves a card up one level and pushes it further out;
// a miss drops it back to level 0 so it comes back right away.
(function (global) {
  const DAY = 24 * 60 * 60 * 1000;
  // Days until the next review after reaching each level.
  const INTERVALS = [0, 1, 3, 7, 14, 30, 60, 120];
  const MAX = INTERVALS.length - 1;

  // Accepts older progress records (c, w, streak, last) and fills in level and due.
  function normalize(s) {
    s = s || {};
    const level = s.level ?? Math.min(s.streak || 0, MAX);
    return {
      c: s.c || 0,
      w: s.w || 0,
      streak: s.streak || 0,
      last: s.last || 0,
      level,
      due: s.due ?? (s.last ? s.last + INTERVALS[level] * DAY : 0),
    };
  }

  function review(s, correct, now) {
    const n = normalize(s);
    if (correct) {
      n.c++;
      n.streak++;
      n.level = Math.min(n.level + 1, MAX);
    } else {
      n.w++;
      n.streak = 0;
      n.level = 0;
    }
    n.last = now;
    n.due = now + INTERVALS[n.level] * DAY;
    return n;
  }

  const isNew = (s) => !s || (s.c || 0) + (s.w || 0) === 0;

  function counts(cards, progress, now) {
    let due = 0, fresh = 0, nextDue = Infinity;
    for (const card of cards) {
      const raw = progress[card.id];
      if (isNew(raw)) { fresh++; continue; }
      const s = normalize(raw);
      if (s.due <= now) due++;
      else nextDue = Math.min(nextDue, s.due);
    }
    return { due, fresh, nextDue: nextDue === Infinity ? null : nextDue };
  }

  // Due cards first (most overdue, then lowest level), then new cards. If nothing is due or new,
  // review ahead with the cards that are due soonest.
  function pick(cards, progress, size, now, rand = Math.random) {
    const limit = size || cards.length;
    const due = [], fresh = [], later = [];
    for (const card of cards) {
      const raw = progress[card.id];
      if (isNew(raw)) { fresh.push(card); continue; }
      const s = normalize(raw);
      (s.due <= now ? due : later).push({ card, s });
    }
    due.sort((a, b) => a.s.due - b.s.due || a.s.level - b.s.level);
    later.sort((a, b) => a.s.due - b.s.due);
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    const chosen = [...due.map((x) => x.card), ...fresh].slice(0, limit);
    if (chosen.length) return { cards: chosen, ahead: false };
    return { cards: later.slice(0, limit).map((x) => x.card), ahead: true };
  }

  function describeWait(ms) {
    const days = ms / DAY;
    if (days < 1) return 'later today';
    if (days < 2) return 'tomorrow';
    return `in ${Math.round(days)} days`;
  }

  global.SRS = { review, normalize, counts, pick, describeWait, INTERVALS, DAY };
})(typeof window !== 'undefined' ? window : globalThis);
