"""
Daily 6x6 Sudoku — Flask backend.

Generates one puzzle per calendar day (same puzzle for every visitor that
day, seeded off the date), serves it to the frontend, and validates
completed grids without ever handing the solution to the browser.
"""

import random
from datetime import date, datetime

from flask import Flask, jsonify, request, render_template

app = Flask(__name__)

ROWS, COLS = 6, 6
BOX_H, BOX_W = 2, 3  # 6x6 sudoku uses 2-row x 3-col boxes
CELLS_TO_REMOVE = 18  # ~50% blanks -> comfortable daily difficulty


# --------------------------------------------------------------------------
# Puzzle generation
# --------------------------------------------------------------------------

def _box_start(r, c):
    return (r // BOX_H) * BOX_H, (c // BOX_W) * BOX_W


def _valid(grid, r, c, val):
    if val in grid[r]:
        return False
    if val in (grid[i][c] for i in range(ROWS)):
        return False
    br, bc = _box_start(r, c)
    for i in range(br, br + BOX_H):
        for j in range(bc, bc + BOX_W):
            if grid[i][j] == val:
                return False
    return True


def _generate_full_grid(rng):
    grid = [[0] * COLS for _ in range(ROWS)]

    def fill(pos=0):
        if pos == ROWS * COLS:
            return True
        r, c = divmod(pos, COLS)
        candidates = list(range(1, 7))
        rng.shuffle(candidates)
        for val in candidates:
            if _valid(grid, r, c, val):
                grid[r][c] = val
                if fill(pos + 1):
                    return True
                grid[r][c] = 0
        return False

    fill()
    return grid


def _count_solutions(grid, limit=2):
    """Counts solutions up to `limit` (early-exits once limit is hit)."""
    count = 0

    def solve():
        nonlocal count
        if count >= limit:
            return
        for pos in range(ROWS * COLS):
            r, c = divmod(pos, COLS)
            if grid[r][c] == 0:
                for val in range(1, 7):
                    if _valid(grid, r, c, val):
                        grid[r][c] = val
                        solve()
                        grid[r][c] = 0
                        if count >= limit:
                            return
                return
        count += 1

    solve()
    return count


def _make_puzzle(rng, solution):
    puzzle = [row[:] for row in solution]
    cells = [(r, c) for r in range(ROWS) for c in range(COLS)]
    rng.shuffle(cells)

    removed = 0
    for (r, c) in cells:
        if removed >= CELLS_TO_REMOVE:
            break
        backup = puzzle[r][c]
        puzzle[r][c] = 0
        trial = [row[:] for row in puzzle]
        if _count_solutions(trial, limit=2) == 1:
            removed += 1
        else:
            puzzle[r][c] = backup  # removing this cell breaks uniqueness

    return puzzle


def _todays_seed_string():
    return date.today().isoformat()


def _parse_client_date(raw):
    """Validates a client-supplied YYYY-MM-DD date string.

    Returns the validated string, or None if missing/invalid/out of range.
    Range is capped to a few days either side of the server's own date so
    a visitor can't be tricked into requesting arbitrary far-future dates.
    """
    if not raw:
        return None
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None

    delta = (parsed - date.today()).days
    if delta < -2 or delta > 2:
        # A legitimate visitor is at most ~1 day off from server date due
        # to timezones; anything wider than this is not a real timezone.
        return None
    return parsed.isoformat()


def get_daily_puzzle(seed_date=None):
    """Deterministic per-day solution + puzzle, seeded off a date string.

    `seed_date` is the calendar date (YYYY-MM-DD) the puzzle should be
    "today" for. Defaults to the server's own date when not given, but
    routes pass in the visitor's local date so the puzzle changes over
    at each visitor's own midnight rather than the server's.
    """
    seed = seed_date or _todays_seed_string()
    rng = random.Random(seed)
    solution = _generate_full_grid(rng)
    puzzle = _make_puzzle(rng, solution)
    return puzzle, solution


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/puzzle")
def api_puzzle():
    seed_date = _parse_client_date(request.args.get("date")) or _todays_seed_string()
    puzzle, _solution = get_daily_puzzle(seed_date)
    given_mask = [[cell != 0 for cell in row] for row in puzzle]
    return jsonify({
        "date": seed_date,
        "puzzle": puzzle,
        "given_mask": given_mask,
        "size": ROWS,
        "box": {"h": BOX_H, "w": BOX_W},
    })


@app.route("/api/validate", methods=["POST"])
def api_validate():
    data = request.get_json(force=True, silent=True) or {}
    submitted = data.get("grid")
    seed_date = _parse_client_date(data.get("date")) or _todays_seed_string()

    if not isinstance(submitted, list) or len(submitted) != ROWS:
        return jsonify({"error": "malformed grid"}), 400

    puzzle, _solution = get_daily_puzzle(seed_date)

    # Reject if any given (pre-filled) cell was altered.
    for r in range(ROWS):
        for c in range(COLS):
            if puzzle[r][c] != 0 and submitted[r][c] != puzzle[r][c]:
                return jsonify({"complete": False, "correct": False,
                                "reason": "given cell modified"})

    complete = all(submitted[r][c] != 0 for r in range(ROWS) for c in range(COLS))
    if not complete:
        return jsonify({"complete": False, "correct": False})

    # A fully-filled grid that satisfies every row/col/box constraint IS
    # the unique solution — no need to compare against a stored answer.
    check = [[0] * COLS for _ in range(ROWS)]
    correct = True
    for r in range(ROWS):
        for c in range(COLS):
            val = submitted[r][c]
            if not isinstance(val, int) or not (1 <= val <= 6) or not _valid(check, r, c, val):
                correct = False
                break
            check[r][c] = val
        if not correct:
            break

    return jsonify({"complete": True, "correct": correct})


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, host="0.0.0.0", port=port)
