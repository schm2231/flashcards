// Speech-to-text via the browser's built-in recognizer (Chrome on Android uses Google's).
(function (global) {
  const Rec = global.SpeechRecognition || global.webkitSpeechRecognition;
  let current = null;

  const ERRORS = {
    'not-allowed': 'Microphone is blocked. In Chrome, tap the icon left of the address bar, then Permissions, and allow the microphone.',
    'service-not-allowed': 'Voice input is turned off for this site in Chrome settings.',
    'no-speech': "Didn't catch that. Tap the mic and try again.",
    'audio-capture': 'No microphone found.',
    network: 'Voice input needs an internet connection.',
    'language-not-supported': "Your phone doesn't support voice input in this box's language.",
  };

  // Resolves with the recognizer's guesses, best first.
  function listen(lang, onInterim) {
    return new Promise((resolve, reject) => {
      stop();
      const r = new Rec();
      current = r;
      r.lang = lang || 'en-US';
      r.interimResults = true;
      r.maxAlternatives = 5;
      r.continuous = false;
      let finals = null;
      let settled = false;
      const fail = (code) => {
        if (settled) return;
        settled = true;
        const err = new Error(ERRORS[code] || (code === 'aborted' ? 'Stopped listening.' : `Voice input error: ${code}`));
        err.code = code;
        reject(err);
      };
      r.onresult = (e) => {
        const res = e.results[e.results.length - 1];
        if (res.isFinal) finals = Array.from(res).map((a) => a.transcript.trim()).filter(Boolean);
        else if (onInterim) onInterim(res[0].transcript);
      };
      r.onerror = (e) => fail(e.error);
      r.onend = () => {
        if (current === r) current = null;
        if (settled) return;
        if (finals && finals.length) { settled = true; resolve(finals); } else fail('no-speech');
      };
      try { r.start(); } catch (e) { fail('start-failed'); }
    });
  }

  function stop() {
    if (!current) return;
    const r = current;
    current = null;
    try { r.abort(); } catch { /* already stopped */ }
  }

  global.Voice = { supported: !!Rec, listen, stop, get active() { return !!current; } };
})(window);
