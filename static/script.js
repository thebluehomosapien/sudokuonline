(function () {
  "use strict";

  const boardEl = document.getElementById("board");
  const greetingEl = document.getElementById("greeting");
  const datelineEl = document.getElementById("dateline");
  const statusEl = document.getElementById("statusMsg");
  const checkBtn = document.getElementById("checkBtn");
  const clearBtn = document.getElementById("clearBtn");
  const padEl = document.getElementById("pad");
  const overlayEl = document.getElementById("overlay");
  const skipConfirmChk = document.getElementById("skipConfirmChk")
  const confirmModal = document.getElementById("confirmModal");
  const modalConfirmBtn = document.getElementById("modalConfirmBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");


  const SIZE = 6;
  let givenMask = null;
  let grid = null; // current working grid (numbers, 0 = blank)
  let selected = null; // {r, c}
  let solved = false;
  let localDateStr = null; // visitor's own YYYY-MM-DD, drives which puzzle they get
  let grid_copy = null; // copy of the original grid to reset the board

  // Returns the visitor's local calendar date as YYYY-MM-DD.
  // Deliberately avoids toISOString(), which converts to UTC first and
  // would give the wrong day to anyone not in UTC.
  function getLocalDateString(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // ---------------------------------------------------------------
  // Greeting
  // ---------------------------------------------------------------
  function setGreeting() {
    const now = new Date();
    localDateStr = getLocalDateString(now);

    const hour = now.getHours();
    let text;
    if (hour >= 5 && hour < 12) text = "Good morning.";
    else if (hour >= 12 && hour < 18) text = "Good afternoon.";
    else text = "Goodnight.";
    greetingEl.textContent = text;

    const dateStr = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    datelineEl.textContent = dateStr;
  }

  // ---------------------------------------------------------------
  // Board rendering
  // ---------------------------------------------------------------
  function renderBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.setAttribute("role", "gridcell");
        cell.tabIndex = 0;

        const val = grid[r][c];
        const isGiven = givenMask[r][c];
        if (isGiven) {
          cell.classList.add("given");
          cell.textContent = val;
        } else if (val) {
          cell.textContent = val;
        }

        if (!isGiven) {
          cell.addEventListener("click", () => selectCell(r, c));
          cell.addEventListener("keydown", onCellKeydown);
        }

        boardEl.appendChild(cell);
      }
    }
  }

  function cellEl(r, c) {
    return boardEl.children[r * SIZE + c];
  }

  function selectCell(r, c) {
    if (givenMask[r][c]) return;
    if (selected) cellEl(selected.r, selected.c).classList.remove("selected");
    selected = { r, c };
    cellEl(r, c).classList.add("selected");
    cellEl(r, c).focus();
  }

  function onCellKeydown(e) {
    const r = Number(e.target.dataset.r);
    const c = Number(e.target.dataset.c);
    if (e.key >= "1" && e.key <= "6") {
      selectCell(r, c);
      setValue(Number(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      selectCell(r, c);
      setValue(0);
    }
  }

  function setValue(val) {
    if (!selected || solved) return;
    const { r, c } = selected;
    if (givenMask[r][c]) return;
    grid[r][c] = val;
    const el = cellEl(r, c);
    el.textContent = val ? val : "";
    el.classList.remove("wrong");
    void el.offsetWidth; // restart animation
    el.classList.add("pop");
    setTimeout(() => el.classList.remove("pop"), 180);
    clearStatus();
  }

  async function clearBoard(){
    if (skipConfirmChk.checked) {
    } else {
      const confirmed = await askConfirm();
      if (!confirmed) {
        return;
      }
    }
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!givenMask[r][c]) {
          grid[r][c] = 0;
        }
      }
    }
    renderBoard();
  }
  padEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".pad-btn");
    if (!btn) return;
    setValue(Number(btn.dataset.val));
  });

  function askConfirm() {
  return new Promise((resolve) => {
    confirmModal.hidden = false;

    function onConfirm() {
      cleanup();
      resolve(true);
    }
    function onCancel() {
      cleanup();
      resolve(false);
    }
    function cleanup() {
      confirmModal.hidden = true;
      modalConfirmBtn.removeEventListener("click", onConfirm);
      modalCancelBtn.removeEventListener("click", onCancel);
    }

    modalConfirmBtn.addEventListener("click", onConfirm);
    modalCancelBtn.addEventListener("click", onCancel);
  });
}

  // ---------------------------------------------------------------
  // Status + validation
  // ---------------------------------------------------------------
  function clearStatus() {
    statusEl.textContent = "";
    statusEl.className = "status-msg";
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status-msg" + (kind ? " " + kind : "");
  }

  async function checkPuzzle() {
    const complete = grid.every((row) => row.every((v) => v !== 0));
    if (!complete) {
      setStatus("Fill every square first.", "error");
      return;
    }

    checkBtn.disabled = true;
    checkBtn.textContent = "Checking…";
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grid, date: localDateStr }),
      });
      const data = await res.json();

      if (data.correct) {
        solved = true;
        showCongrats();
      } else {
        setStatus("Not quite — check for repeats in a row, column, or box.", "error");
        flashWrongCells();
      }
    } catch (err) {
      setStatus("Couldn't reach the server. Try again.", "error");
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = "Check puzzle";
    }
  }

  function flashWrongCells() {
    // Simple global nudge: shake every editable filled cell so the player
    // knows something's off, without revealing which cell specifically.
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!givenMask[r][c] && grid[r][c]) {
          const el = cellEl(r, c);
          el.classList.remove("wrong");
          void el.offsetWidth;
          el.classList.add("wrong");
        }
      }
    }
  }

  function showCongrats() {
    overlayEl.hidden = false;
    overlayEl.addEventListener(
      "click",
      () => {
        overlayEl.hidden = true;
      },
      { once: true }
    );
  }

  checkBtn.addEventListener("click", checkPuzzle);
  clearBtn.addEventListener("click" , clearBoard);
  skipConfirmChk.checked = localStorage.getItem("skipConfirm") === "true";
  skipConfirmChk.addEventListener("change", () => {
    localStorage.setItem("skipConfirm", skipConfirmChk.checked);
  });
  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function init() {
    setGreeting();
    try {
      const res = await fetch(`/api/puzzle?date=${encodeURIComponent(localDateStr)}`);
      const data = await res.json();
      grid = data.puzzle.map((row) => row.slice());
      grid_copy = data.puzzle.map((row) => row.slice())
      givenMask = data.given_mask;
      renderBoard();
    } catch (err) {
      setStatus("Couldn't load today's puzzle. Refresh to try again.", "error");
    }
  }

  init();
})();
