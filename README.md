# Flashcards

A phone flash card app (installable web app, no app store) that loads study cards from a Google Sheet.

## Sheet format

The sheet must be shared as **Anyone with the link: Viewer**.

- **`Boxes` tab:** `Box (exact tab name) | Description | Answer language | Active`. Only rows with Active checked show up.
- **One tab per Box:** `Prompt | Answer | Also accept (separate with ;) | Grading | Hint`.
  - `Grading` is `type` (the app checks your typed answer) or `self` (you reveal the answer and mark yourself).
  - Start an answer with `'` if it begins with `=`, or Sheets treats it as a formula.

## Grading

Typed answers ignore case, punctuation and leading articles (the, el, la…). Missing accents and small typos on longer
answers count as correct, with a note. Every result has an override button.

## Voice answers

Tap the mic on a typed card and say the answer. It uses Chrome's built-in speech recognition in the box's
`Answer language` (for example `es-ES`), checks every guess the recognizer returns, and grades it like a typed answer.

## Spaced repetition

Each correct answer moves a card up a level: it comes back in 1, 3, 7, 14, 30, 60, then 120 days. A miss drops it to
level 0 and it's due again immediately. Sessions show due cards first (most overdue first), then new cards. When
nothing is due, a session reviews ahead with the cards due soonest. "Study missed cards again" is practice and doesn't
change scheduling or counts. Per-card correct and incorrect counts are kept alongside the schedule.

## Syncing

The app re-reads the sheet every time it opens with a connection, and keeps the last copy for offline use.

## Running locally

No build step. Serve the folder and open it:

```sh
python3 -m http.server 8000
```

Progress is stored in the browser's localStorage on the device.
