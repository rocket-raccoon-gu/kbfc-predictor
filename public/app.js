const STORAGE_KEY = "kbfc-phone";

let state = null;
let tab = "matches";
let draftPhone = "";
let draftName = "";
let saving = false;
let pending = null;
let lookupGen = 0;
let lastLookup = "";
const draftScores = {};

const app = document.getElementById("app");
const identity = document.getElementById("identity");
const banner = document.getElementById("banner");

document.body.addEventListener("click", onClick);
document.body.addEventListener("input", onInput);
load();

async function load() {
  const phone = localStorage.getItem(STORAGE_KEY) || "";
  try {
    const res = await fetch("/api/bootstrap?phone=" + encodeURIComponent(phone), { cache: "no-store" });
    if (!res.ok) throw new Error("load failed");
    state = await res.json();
    if (phone && !state.user) localStorage.removeItem(STORAGE_KEY);
    render();
  } catch {
    showBanner("Could not load the fixtures. Check the connection and refresh.");
  }
}

function render() {
  document.getElementById("tab-matches").classList.toggle("active", tab === "matches");
  document.getElementById("tab-board").classList.toggle("active", tab === "board");
  renderIdentity();
  app.innerHTML = tab === "matches" ? renderMatches() : renderBoard();
}

function renderIdentity() {
  const key = state.user ? `u:${state.user.name}:${state.user.phoneMask}` : "guest";
  if (identity.dataset.key === key) return;
  identity.dataset.key = key;
  if (state.user) {
    identity.className = "identity known";
    identity.innerHTML = `
      <div>
        <strong>Hi, ${esc(state.user.name)}</strong>
        <p>Predicting as ${esc(state.user.phoneMask)}. One pick per match.</p>
      </div>
      <button type="button" class="ghost" data-action="switch">Switch number</button>
    `;
    return;
  }
  identity.className = "identity";
  identity.innerHTML = `
    <label>Mobile number
      <input id="phone" type="text" inputmode="numeric" autocomplete="tel" maxlength="16" placeholder="10-digit mobile" value="${esc(draftPhone)}" />
    </label>
    <label id="name-wrap">Name
      <input id="name" type="text" autocomplete="name" maxlength="40" placeholder="Your name" value="${esc(draftName)}" />
    </label>
    <p id="identity-note">New predictors add a name and mobile once. If this number has predicted before, only the score is needed.</p>
  `;
}

function renderMatches() {
  if (!state.matches.length) return `<p class="empty">No matches yet.</p>`;
  return state.matches.map(renderMatch).join("");
}

function renderMatch(match) {
  const place = match.home ? "Home" : "Away";
  const labels = { open: "Open", final: "Full time", locked: "Closed", upcoming: "Upcoming" };
  return `
    <article class="card">
      <div class="match-top">
        <span class="pill ${match.home ? "home" : "away"}">${place}</span>
        <span class="pill ${match.status}">${labels[match.status] || "Closed"}</span>
      </div>
      <p class="when">${esc(match.kickoffLabel)}${countdown(match)}</p>
      ${crestRow(match)}
      <h2 class="fixture">${esc(match.fixture)}</h2>
      <p class="venue">${esc(match.venue)}</p>
      ${renderMatchBody(match)}
    </article>
  `;
}

function crestRow(match) {
  const kbfc = logo(match.kbfcLogo, "Kerala Blasters");
  const opponent = logo(match.opponentLogo, match.opponent);
  return `<div class="crest-row">${match.home ? kbfc : opponent}<span class="vs">vs</span>${match.home ? opponent : kbfc}</div>`;
}

function logo(src, alt) {
  if (!src) return "";
  return `<img class="team-logo" src="${esc(src)}" alt="${esc(alt)}" width="72" height="72">`;
}

function renderMatchBody(match) {
  if (match.status === "final") {
    const mine = match.myPick
      ? `<p class="points ${match.myPick.points > 0 ? "good" : "zero"}">Your pick ${match.myPick.kbfcScore}–${match.myPick.opponentScore} · ${pointsLabel(match.myPick)}</p>`
      : `<p class="muted">You did not predict this match.</p>`;
    return `
      <div class="final-score">
        <div class="muted">Full time</div>
        <strong>${scoreLine(match, match.kbfcScore, match.opponentScore)}</strong>
        ${mine}
      </div>
    `;
  }
  if (match.myPick) {
    return `
      <div class="locked">
        <div class="muted">Your prediction is locked</div>
        <strong>Blasters ${match.myPick.kbfcScore} – ${match.myPick.opponentScore} ${esc(match.shortName)}</strong>
        <p class="muted">${match.status === "locked" ? "Points land here after the full-time score is added." : "This cannot be changed."}</p>
      </div>
    `;
  }
  if (match.status === "locked") {
    return `<p class="muted">Kickoff has passed. Predictions are closed.</p>`;
  }
  if (match.status !== "open") {
    return `<p class="muted">Predictions open when this is the next match.</p>`;
  }
  const scores = scoreOf(match.id);
  return `
    <div class="predict-grid">
      <div class="score-box">
        <span>${logo(match.kbfcLogo, "Kerala Blasters")} Kerala Blasters</span>
        ${stepper(match.id, "kbfc", scores.kbfc)}
      </div>
      <div class="score-box">
        <span>${logo(match.opponentLogo, match.opponent)} ${esc(match.shortName)}</span>
        ${stepper(match.id, "opp", scores.opp)}
      </div>
    </div>
    <button type="button" class="btn" data-action="predict" data-match="${esc(match.id)}">Lock in prediction</button>
  `;
}

function stepper(id, side, value) {
  return `
    <div class="stepper">
      <button type="button" data-action="step" data-dir="-1" data-match="${esc(id)}" data-side="${side}" aria-label="Decrease">−</button>
      <input class="score-input" inputmode="numeric" value="${esc(value)}" data-match="${esc(id)}" data-side="${side}" aria-label="Score" />
      <button type="button" data-action="step" data-dir="1" data-match="${esc(id)}" data-side="${side}" aria-label="Increase">+</button>
    </div>
  `;
}

function renderBoard() {
  const season = state.leaderboard.length
    ? `<div class="lb-head"><span>#</span><span>Name</span><span></span><span>Pts</span></div>` +
      state.leaderboard.map((row) => `
        <div class="lb-row ${row.mine ? "mine" : ""}">
          <span class="rank">${row.rank}</span>
          <span>${esc(row.name)}<span class="pick-line">${row.exact} exact · ${row.played} played</span></span>
          <span></span>
          <span class="pts">${row.points}</span>
        </div>
      `).join("")
    : `<p class="empty">No points yet. Exact score is 8 points. The right result only is 3.</p>`;

  const matches = state.matchBoards.map((board) => {
    const rows = board.rows.length
      ? board.rows.map((row) => `
          <div class="lb-row ${row.mine ? "mine" : ""}">
            <span class="rank">${row.rank}</span>
            <span>${esc(row.name)}<span class="pick-line">Blasters ${row.kbfcScore}–${row.opponentScore} ${esc(board.opponent)}</span></span>
            <span></span>
            <span class="pts">${row.points}</span>
          </div>
        `).join("")
      : `<p class="empty">No predictions were locked in.</p>`;
    return `
      <section class="card">
        <div class="board-title">
          <h2>${esc(board.fixture)}</h2>
        </div>
        <p class="when">${esc(board.kickoffLabel)} · Blasters ${board.kbfcScore}–${board.opponentScore} ${esc(board.opponent)}</p>
        ${rows}
      </section>
    `;
  }).join("");

  return `
    <section class="card">
      <div class="board-title"><h2>Season</h2></div>
      ${season}
    </section>
    ${matches}
  `;
}

async function onClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "tab") {
    tab = target.dataset.tab;
    showBanner("");
    render();
  }
  if (action === "switch") {
    localStorage.removeItem(STORAGE_KEY);
    draftPhone = "";
    draftName = "";
    lastLookup = "";
    identity.dataset.key = "";
    await load();
  }
  if (action === "step") {
    const id = target.dataset.match;
    const side = target.dataset.side;
    const next = clamp(Number(scoreOf(id)[side]) + Number(target.dataset.dir));
    scoreOf(id)[side] = String(next);
    const input = app.querySelector(`.score-input[data-match="${cssEscape(id)}"][data-side="${side}"]`);
    if (input) input.value = String(next);
  }
  if (action === "predict") {
    await submitPrediction(target.dataset.match, target);
  }
}

function onInput(event) {
  const target = event.target;
  if (target.id === "phone") {
    draftPhone = target.value;
    lookupPhone(target.value);
  }
  if (target.id === "name") draftName = target.value;
  if (target.classList.contains("score-input")) {
    const next = clamp(target.value);
    scoreOf(target.dataset.match)[target.dataset.side] = String(next);
    target.value = String(next);
  }
}

async function lookupPhone(raw) {
  const phone = normalizePhone(raw);
  const note = document.getElementById("identity-note");
  const nameWrap = document.getElementById("name-wrap");
  if (!phone) {
    lastLookup = "";
    if (nameWrap) nameWrap.hidden = false;
    if (note) note.textContent = "New predictors add a name and mobile once. If this number has predicted before, only the score is needed.";
    return;
  }
  if (phone === lastLookup) return;
  lastLookup = phone;
  const gen = ++lookupGen;
  try {
    const res = await fetch("/api/user?phone=" + encodeURIComponent(raw), { cache: "no-store" });
    const data = await res.json();
    if (gen !== lookupGen) return;
    if (data.exists) {
      localStorage.setItem(STORAGE_KEY, data.phone);
      identity.dataset.key = "";
      await load();
      return;
    }
    if (nameWrap) nameWrap.hidden = false;
    if (note) note.textContent = "New number. Add your name with this prediction. Next time, only the score.";
  } catch {
    showBanner("Could not check that mobile number. You can still submit.");
  }
}

async function submitPrediction(matchId, button) {
  if (saving) return;
  const match = state.matches.find((item) => item.id === matchId);
  if (!match) return;
  const scores = liveScores(matchId);
  const kbfcScore = clamp(scores.kbfc);
  const opponentScore = clamp(scores.opp);
  const phone = state.user ? localStorage.getItem(STORAGE_KEY) || "" : currentPhone();
  const name = state.user ? "" : currentName();
  if (!state.user && !normalizePhone(phone)) {
    showBanner("Enter a valid 10-digit mobile number before predicting.");
    document.getElementById("phone")?.focus();
    return;
  }
  if (!pending || pending.matchId !== matchId || pending.kbfc !== kbfcScore || pending.opp !== opponentScore) {
    pending = { matchId, kbfc: kbfcScore, opp: opponentScore };
    button.textContent = `Tap again to lock ${kbfcScore}–${opponentScore}`;
    showBanner(`Lock Kerala Blasters ${kbfcScore}–${opponentScore} ${match.shortName}? Tap the button again. This cannot be changed.`, "warn");
    return;
  }
  pending = null;
  saving = true;
  button.disabled = true;
  showBanner("");
  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, name, matchId, kbfcScore, opponentScore }),
    });
    const data = await res.json();
    if (!res.ok) {
      showBanner(data.error || "Could not save that prediction.");
      button.disabled = false;
      saving = false;
      return;
    }
    localStorage.setItem(STORAGE_KEY, data.phone);
    identity.dataset.key = "";
    saving = false;
    await load();
  } catch {
    saving = false;
    button.disabled = false;
    showBanner("Could not save that prediction. Try again.");
  }
}

function liveScores(matchId) {
  const kbfc = app.querySelector(`.score-input[data-match="${cssEscape(matchId)}"][data-side="kbfc"]`);
  const opp = app.querySelector(`.score-input[data-match="${cssEscape(matchId)}"][data-side="opp"]`);
  const stored = scoreOf(matchId);
  return {
    kbfc: kbfc ? kbfc.value : stored.kbfc,
    opp: opp ? opp.value : stored.opp,
  };
}

function currentPhone() {
  const field = document.getElementById("phone");
  return field ? field.value : draftPhone;
}

function currentName() {
  const field = document.getElementById("name");
  return field ? field.value : draftName;
}

function scoreOf(id) {
  if (!draftScores[id]) draftScores[id] = { kbfc: "0", opp: "0" };
  return draftScores[id];
}

function scoreLine(match, kbfc, opponent) {
  if (match.home) return `Blasters ${kbfc} – ${opponent} ${esc(match.shortName)}`;
  return `${esc(match.shortName)} ${opponent} – ${kbfc} Blasters`;
}

function pointsLabel(pick) {
  if (pick.exact) return "8 points · exact score";
  if (pick.correct) return "3 points · correct result";
  return "0 points";
}

function countdown(match) {
  if (match.status !== "open") return "";
  const ms = new Date(match.kickoff).getTime() - Date.now();
  if (ms <= 0) return " · closing";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 72) return "";
  if (hours > 0) return ` · closes in ${hours}h ${minutes}m`;
  return ` · closes in ${minutes}m`;
}

function clamp(value) {
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n) || n < 0) return 0;
  if (n > 20) return 20;
  return n;
}

function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : "";
}

function showBanner(text, tone) {
  banner.classList.toggle("warn", tone === "warn");
  if (!text) {
    banner.hidden = true;
    banner.textContent = "";
    return;
  }
  banner.hidden = false;
  banner.textContent = text;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function cssEscape(value) {
  return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, "");
}
