// Loads Boxes and cards from a Google Sheet shared as "Anyone with the link: Viewer".
(function (global) {
  function sheetIdFrom(input) {
    const s = String(input || '').trim();
    const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return /^[a-zA-Z0-9_-]{25,}$/.test(s) ? s : null;
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v.trim() !== ''));
  }

  async function fetchTab(sheetId, tab) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
    let res;
    try {
      res = await fetch(url, { cache: 'no-store' });
    } catch (e) {
      throw new Error('Could not reach the sheet. Check your connection, and that the sheet is shared as "Anyone with the link: Viewer".');
    }
    if (!res.ok) throw new Error(`Google returned ${res.status} for tab "${tab}".`);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error('The sheet is not shared publicly. Set it to "Anyone with the link: Viewer".');
    return parseCSV(text);
  }

  // Map header names to column indexes, by prefix so "Also accept (separate with ;)" still matches.
  function columns(header, wanted) {
    const h = header.map((x) => x.trim().toLowerCase());
    const out = {};
    for (const [key, prefix] of Object.entries(wanted)) out[key] = h.findIndex((x) => x.startsWith(prefix));
    return out;
  }

  function truthy(v) {
    return /^(true|yes|y|1|x)$/i.test(String(v || '').trim());
  }

  async function loadLibrary(sheetId) {
    const boxRows = await fetchTab(sheetId, 'Boxes');
    if (!boxRows.length) throw new Error('The "Boxes" tab is empty.');
    const bc = columns(boxRows[0], { name: 'box', desc: 'desc', lang: 'answer lang', active: 'active' });
    if (bc.name < 0) throw new Error('The "Boxes" tab needs a "Box" column in row 1.');

    const boxDefs = boxRows.slice(1)
      .map((r) => ({
        name: (r[bc.name] || '').trim(),
        description: bc.desc >= 0 ? (r[bc.desc] || '').trim() : '',
        lang: (bc.lang >= 0 && (r[bc.lang] || '').trim()) || 'en-US',
        active: bc.active < 0 ? true : truthy(r[bc.active]),
      }))
      .filter((b) => b.name && b.active);

    const results = await Promise.all(boxDefs.map(async (b) => {
      try {
        const rows = await fetchTab(sheetId, b.name);
        // Google silently returns the first tab when a tab name doesn't exist, so check the headers.
        const cc = columns(rows[0] || [], { prompt: 'prompt', answer: 'answer', alts: 'also', grading: 'grading', hint: 'hint' });
        if (cc.prompt < 0 || cc.answer < 0) {
          return { ...b, cards: [], error: `No tab named "${b.name}" with Prompt and Answer columns.` };
        }
        const seen = new Set();
        const cards = rows.slice(1).map((r) => {
          const prompt = (r[cc.prompt] || '').trim();
          const answer = (r[cc.answer] || '').trim();
          const alts = cc.alts >= 0 ? (r[cc.alts] || '').split(';').map((s) => s.trim()).filter(Boolean) : [];
          const grading = cc.grading >= 0 && /^self/i.test((r[cc.grading] || '').trim()) ? 'self' : 'type';
          const hint = cc.hint >= 0 ? (r[cc.hint] || '').trim() : '';
          return { id: `${b.name}␟${prompt}`, prompt, answer, alts, grading, hint };
        }).filter((c) => {
          if (!c.prompt || !c.answer || seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
        return { ...b, cards, error: null };
      } catch (e) {
        return { ...b, cards: [], error: e.message };
      }
    }));

    return { sheetId, fetchedAt: Date.now(), boxes: results };
  }

  global.Sheets = { sheetIdFrom, parseCSV, loadLibrary };
})(typeof window !== 'undefined' ? window : globalThis);
