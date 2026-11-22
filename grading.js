// Answer checking. Lenient on case, punctuation, accents, leading articles and small typos.
(function (global) {
  const ARTICLES = new Set([
    'the', 'a', 'an', 'to',
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'le', 'les', 'l', 'der', 'die', 'das',
  ]);

  function clean(s, keepAccents) {
    let t = String(s || '').toLowerCase().normalize('NFD');
    if (!keepAccents) t = t.replace(/[̀-ͯ]/g, '');
    return t.normalize('NFC')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripArticles(s) {
    const words = s.split(' ');
    while (words.length > 1 && ARTICLES.has(words[0])) words.shift();
    return words.join(' ');
  }

  // Edit distance where swapping two neighbouring letters counts as one typo.
  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[m][n];
  }

  function typoAllowance(len) {
    if (len <= 5) return 0; // short words: one letter often makes a different word (comer/coger)
    if (len <= 10) return 1;
    return 2;
  }

  // Returns { correct: bool, kind: 'exact'|'accent'|'article'|'typo'|'wrong'|'empty', matched: string }
  function grade(input, answers) {
    const list = answers.filter(Boolean);
    if (!clean(input, false)) return { correct: false, kind: 'empty', matched: list[0] || '' };

    const tiers = [
      ['exact', (a) => clean(input, true) === clean(a, true)],
      ['accent', (a) => clean(input, false) === clean(a, false)],
      ['article', (a) => stripArticles(clean(input, false)) === stripArticles(clean(a, false))],
      ['typo', (a) => {
        const x = stripArticles(clean(input, false));
        const y = stripArticles(clean(a, false));
        return levenshtein(x, y) <= typoAllowance(y.length);
      }],
    ];
    for (const [kind, test] of tiers) {
      const hit = list.find(test);
      if (hit) return { correct: true, kind, matched: hit };
    }
    return { correct: false, kind: 'wrong', matched: list[0] || '' };
  }

  global.Grading = { grade, clean, levenshtein };
})(typeof window !== 'undefined' ? window : globalThis);
