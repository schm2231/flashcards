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

## Running locally

No build step. Serve the folder and open it:

```sh
python3 -m http.server 8000
```

Progress is stored in the browser's localStorage on the device.
