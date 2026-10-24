const STORAGE_KEY = "kbfc-phone";

let state = null;
let tab = "matches";
let showMatchBoards = false;
const openPicks = new Set();
let draftPhone = "";
let draftCountry = "+974";
let draftName = "";
let draftMember = false;
let saving = false;
let lookupGen = 0;
let lastLookup = "";
let timerHandle = 0;
const editing = {};
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
  identity.hidden = tab !== "matches";
  renderIdentity();
  app.innerHTML = tab === "matches" ? renderMatches() : renderBoard();
  startTimer();
}

function renderIdentity() {
  const key = state.user ? `u:${state.user.name}:${state.user.phoneMask}:${state.user.member ? 1 : 0}` : "guest";
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
      ${state.user.member ? "" : memberCheck()}
    `;
    return;
  }
  identity.className = "identity";
  identity.innerHTML = `
    <label>Mobile number
      <span class="phone-row">
        <input id="country" type="text" value="+974" readonly tabindex="-1" aria-readonly="true" aria-label="Country code, locked to Qatar" />
        <input id="phone" type="text" inputmode="tel" autocomplete="tel-national" maxlength="16" placeholder="5015 4119" value="${esc(draftPhone)}" />
      </span>
    </label>
    <label id="name-wrap">Name
      <input id="name" type="text" autocomplete="name" maxlength="40" placeholder="Your name" value="${esc(draftName)}" />
    </label>
    ${memberCheck()}
    <p id="identity-note" hidden></p>
  `;
}

function memberCheck() {
  return `
    <label class="member-check">
      <input id="whatsapp-member" type="checkbox" ${draftMember ? "checked" : ""} />
      <span>Are you a member of the Manjappada Qatar WhatsApp group?</span>
    </label>
  `;
}

function renderMatches() {
  if (!state.matches.length) return `<p class="empty">No matches yet.</p>`;
  const rank = { open: 0, upcoming: 1, locked: 2, final: 3 };
  const matches = [...state.matches].sort((a, b) => {
    const byStatus = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    return new Date(a.kickoff) - new Date(b.kickoff);
  });
  return matches.map(renderMatch).join("");
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
      <p class="when">${esc(match.kickoffLabel)}</p>
      ${match.status === "open" ? timerBlock(match) : ""}
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
      ? `<div class="your-pick">
          <div class="muted">Your prediction</div>
          <strong>${scoreLine(match, match.myPick.kbfcScore, match.myPick.opponentScore)}</strong>
          <p class="points ${match.myPick.points > 0 ? "good" : "zero"}">${pointsLabel(match.myPick)}</p>
        </div>`
      : `<p class="muted">You did not predict this match.</p>`;
    return `
      <div class="final-score">
        <div class="muted">Full time</div>
        <strong>${scoreLine(match, match.kbfcScore, match.opponentScore)}</strong>
        ${mine}
      </div>
    `;
  }
  if (match.myPick && !(match.status === "open" && editing[match.id])) {
    const canEdit = match.status === "open";
    return `
      <div class="locked">
        <div class="muted">${canEdit ? "Your prediction" : "Your prediction is locked"}</div>
        <strong>${scoreLine(match, match.myPick.kbfcScore, match.myPick.opponentScore)}</strong>
        <p class="muted">${canEdit ? "You can change this until predictions close." : "Points land here after the full-time score is added."}</p>
        ${canEdit ? `<button type="button" class="ghost edit-prediction" data-action="edit" data-match="${esc(match.id)}">Edit prediction</button>` : ""}
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
    <button type="button" class="btn" data-action="predict" data-match="${esc(match.id)}">${match.myPick ? "Update prediction" : "Lock in prediction"}</button>
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
      state.leaderboard.map((row) => {
        const key = `${row.name}|${row.phoneEnd}`;
        const open = openPicks.has(key);
        const detail = open
          ? `<div class="user-picks">${row.picks?.length
            ? row.picks.map((pick) => `<p><span>${esc(pick.fixture)}</span><b>${scoreLine(pick, pick.kbfcScore, pick.opponentScore)}</b></p>`).join("")
            : `<p>No prediction yet.</p>`}</div>`
          : "";
        return `
          <button type="button" class="lb-row ${row.mine ? "mine" : ""} ${open ? "open" : ""}" data-action="user-pick" data-user="${esc(key)}" aria-expanded="${open}">
            <span class="rank">${row.rank}</span>
            <span>${esc(row.name)}<span class="phone-tail">···${esc(row.phoneEnd)}</span><span class="pick-line">${row.exact} exact · ${row.played} played</span></span>
            <span></span>
            <span class="pts">${row.points}</span>
          </button>
          ${detail}
        `;
      }).join("")
    : `<p class="empty">No predictors yet. 3 points for the result and 5 points for an exact score.</p>`;

  const matches = state.matchBoards.map((board) => {
    const rows = board.rows.length
      ? board.rows.map((row) => `
          <div class="lb-row ${row.mine ? "mine" : ""}">
            <span class="rank">${row.rank}</span>
            <span>${esc(row.name)}<span class="phone-tail">···${esc(row.phoneEnd)}</span><span class="pick-line">${row.predicted ? `Blasters ${row.kbfcScore}–${row.opponentScore} ${esc(board.opponent)}` : "No prediction"}</span></span>
            <span></span>
            <span class="pts">${row.points}</span>
          </div>
        `).join("")
      : `<p class="empty">Nobody predicted this match.</p>`;
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

  const toggle = state.matchBoards.length
    ? `<button type="button" class="ghost board-toggle" data-action="match-boards">${showMatchBoards ? "Hide match leaderboards" : "View match leaderboards"}</button>`
    : "";

  return `
    <section class="card">
      <div class="board-title"><h2>Season 13</h2></div>
      ${season}
      ${toggle}
    </section>
    ${showMatchBoards ? matches : ""}
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
  if (action === "match-boards") {
    showMatchBoards = !showMatchBoards;
    render();
  }
  if (action === "user-pick") {
    const key = target.dataset.user;
    if (openPicks.has(key)) openPicks.delete(key);
    else openPicks.add(key);
    render();
  }
  if (action === "switch") {
    localStorage.removeItem(STORAGE_KEY);
    draftPhone = "";
    draftCountry = "+974";
    draftName = "";
    draftMember = false;
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
  if (action === "edit") {
    const id = target.dataset.match;
    const match = state.matches.find((item) => item.id === id);
    if (!match?.myPick) return;
    draftScores[id] = { kbfc: String(match.myPick.kbfcScore), opp: String(match.myPick.opponentScore) };
    editing[id] = true;
    render();
  }
  if (action === "predict") {
    await submitPrediction(target.dataset.match, target);
  }
}

function onInput(event) {
  const target = event.target;
  if (target.id === "phone") {
    draftPhone = target.value;
    lookupPhone();
  }
  if (target.id === "name") draftName = target.value;
  if (target.id === "whatsapp-member") draftMember = target.checked;
  if (target.classList.contains("score-input")) {
    const next = clamp(target.value);
    scoreOf(target.dataset.match)[target.dataset.side] = String(next);
    target.value = String(next);
  }
}

async function lookupPhone() {
  const country = currentCountry();
  const national = currentPhone();
  const phone = normalizePhone(national, country);
  const note = document.getElementById("identity-note");
  const nameWrap = document.getElementById("name-wrap");
  if (!phone) {
    lastLookup = "";
    if (nameWrap) nameWrap.hidden = false;
    if (note) {
      note.hidden = true;
      note.textContent = "";
    }
    return;
  }
  if (phone === lastLookup) return;
  lastLookup = phone;
  const gen = ++lookupGen;
  try {
    const res = await fetch("/api/user?phone=" + encodeURIComponent(national) + "&country=" + encodeURIComponent(country), { cache: "no-store" });
    const data = await res.json();
    if (gen !== lookupGen) return;
    if (data.exists) {
      localStorage.setItem(STORAGE_KEY, data.phone);
      identity.dataset.key = "";
      await load();
      return;
    }
    if (nameWrap) nameWrap.hidden = false;
    if (note) {
      note.hidden = false;
      note.textContent = "New number. Add your name with this prediction. Next time, only the score.";
    }
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
  const countryCode = state.user ? "" : currentCountry();
  const name = state.user ? "" : currentName();
  const member = state.user?.member || document.getElementById("whatsapp-member")?.checked === true;
  if (!member) {
    showBanner("Tick the box to confirm you are in the Manjappada Qatar WhatsApp group.");
    document.getElementById("whatsapp-member")?.focus();
    return;
  }
  if (!state.user && !normalizePhone(phone, countryCode)) {
    showBanner("Only Qatar numbers can predict. Use +974 and an 8-digit mobile number.");
    document.getElementById("phone")?.focus();
    return;
  }
  saving = true;
  button.disabled = true;
  showBanner("");
  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, countryCode, name, matchId, kbfcScore, opponentScore, member: true }),
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
    editing[matchId] = false;
    delete draftScores[matchId];
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

function currentCountry() {
  return "+974";
}

function currentName() {
  const field = document.getElementById("name");
  return field ? field.value : draftName;
}

function scoreOf(id) {
  if (!draftScores[id]) {
    const match = state?.matches?.find((item) => item.id === id);
    draftScores[id] = match?.myPick
      ? { kbfc: String(match.myPick.kbfcScore), opp: String(match.myPick.opponentScore) }
      : { kbfc: "0", opp: "0" };
  }
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

function timerBlock(match) {
  return `
    <div class="countdown">
      <p class="timer" data-close="${esc(match.closesAt)}" aria-live="polite">
        <b data-part="h">00</b><span>h</span>
        <b data-part="m">00</b><span>m</span>
        <b data-part="s">00</b><span>s</span>
      </p>
      <p>Predictions close at ${esc(match.closeLabel)} Qatar time</p>
    </div>
  `;
}

function startTimer() {
  if (timerHandle) window.clearInterval(timerHandle);
  const node = document.querySelector(".timer");
  if (!node) return;
  const tick = () => {
    const ms = new Date(node.dataset.close).getTime() - Date.now();
    if (ms <= 0) {
      window.clearInterval(timerHandle);
      timerHandle = 0;
      load();
      return;
    }
    const total = Math.floor(ms / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (value) => String(value).padStart(2, "0");
    node.querySelector("[data-part='h']").textContent = pad(hours);
    node.querySelector("[data-part='m']").textContent = pad(minutes);
    node.querySelector("[data-part='s']").textContent = pad(seconds);
  };
  tick();
  timerHandle = window.setInterval(tick, 1000);
}

function clamp(value) {
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n) || n < 0) return 0;
  if (n > 20) return 20;
  return n;
}

function normalizePhone(raw, countryCode) {
  const explicit = countryCode !== undefined && String(countryCode).trim() !== "";
  if (explicit && String(countryCode).replace(/\D/g, "") !== "974") return "";
  let digits = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  if (digits.startsWith("974") && digits.length === 11) digits = digits.slice(3);
  return /^\d{8}$/.test(digits) ? "974" + digits : "";
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
