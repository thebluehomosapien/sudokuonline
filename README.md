# Daily Six — a 6×6 sudoku that resets every day

A small Flask site that generates one 6×6 sudoku puzzle per calendar day
(same puzzle for everyone who visits that day), greets the player based on
their local time, and shows a "see you tomorrow" message on completion.

## Run it locally

```bash
cd sudoku
pip install -r requirements.txt
python app.py
```

Then open **http://127.0.0.1:5000** in your browser.

## How it works

- **`app.py`** — Flask backend. Generates a full solved 6×6 grid and a
  puzzle (with a unique solution) seeded off today's date, so the puzzle
  is identical for every visitor and changes automatically at midnight
  server time. Two routes:
  - `GET /api/puzzle` → today's puzzle + which cells are pre-filled
  - `POST /api/validate` → checks a submitted grid for completeness and
    correctness (rows/columns/2×3 boxes each containing 1–6 once)
- **`templates/index.html`** — page structure (greeting, grid, number pad).
- **`static/style.css`** — visual design (ink/graph-paper puzzle-book look).
- **`static/script.js`** — greeting logic (reads the browser's local time
  to say good morning / good afternoon / goodnight), board rendering,
  cell selection + number entry, and the completion overlay.

## Notes on the daily puzzle

The puzzle now resets on **each visitor's own local date**, not the
server's. The browser computes its local `YYYY-MM-DD` and sends it as
`?date=` to `/api/puzzle` (and in the body of `/api/validate`), and the
server generates that day's puzzle from it. So someone in Tokyo and
someone in Los Angeles each get a new grid at their own midnight, not
simultaneously at the server's midnight.

A couple of guardrails on the backend:
- The date is validated as a real `YYYY-MM-DD` date.
- It's capped to within 2 days of the server's own date, so a visitor's
  legitimate timezone offset works, but arbitrary far-future/past dates
  are rejected and fall back to the server's date.
- If the date param is missing or invalid, it falls back to the server's
  own date, so the app still works even with JS disabled or an old cached
  page.

## Deploying

This ships with Flask's built-in dev server (`app.run(debug=True)`), which
is fine for trying it out but not for production. For real hosting, run it
behind a WSGI server, e.g.:

```bash
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:8000 app:app
```

and turn off `debug=True` in `app.py` first.
