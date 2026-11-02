const PIN_KEY = "kbfc-admin-pin";
const banner = document.getElementById("banner");
const app = document.getElementById("app");
const pinInput = document.getElementById("pin");
const lock = document.getElementById("lock");

pinInput.value = sessionStorage.getItem(PIN_KEY) || "";
document.getElementById("unlock").addEventListener("click", () => {
  sessionStorage.setItem(PIN_KEY, pinInput.value.trim());
  load();
});
pinInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("unlock").click();
});
if (pinInput.value) load();

async function load() {
  showBanner("");
  const res = await fetch("/api/admin/matches", { headers: pinHeaders(), cache: "no-store" });
  const data = await res.json();
  if (!res.ok) {
    app.innerHTML = "";
    lock.hidden = false;
    showBanner(data.error || "Could not unlock the result desk.");
    return;
  }
  lock.hidden = true;
  const finished = data.matches.filter((match) => match.kbfcScore != null && match.opponentScore != null);
  const upcoming = data.matches.filter((match) => match.kbfcScore == null || match.opponentScore == null);
  app.innerHTML =
    renderAnalytics(data.analytics) +
    renderFinished(finished) +
    renderUpcoming(upcoming);
}

function renderAnalytics(analytics) {
  const top = analytics.topPredictors?.length
    ? `<div class="admin-top">
        <h3>Top predictors</h3>
        <div class="lb-head"><span>#</span><span>Name</span><span>Phone</span><span>Pts</span></div>
        ${analytics.topPredictors
          .map(
            (row) => `
          <div class="lb-row">
            <span class="rank">${row.rank}</span>
            <span>${esc(row.name)}<span class="pick-line">${row.exact} exact · ${row.played} played</span></span>
            <span class="phone-full">${esc(row.phone)}</span>
            <span class="pts">${row.points}</span>
          </div>`,
          )
          .join("")}
      </div>`
    : `<p class="muted">Season points appear here after full-time scores are in.</p>`;

  return `
    <section class="card admin-analytics">
      <div class="board-title">
        <h2>Analytics</h2>
        <button type="button" class="btn" data-action="export-all">Export all data</button>
      </div>
      <div class="admin-stats">
        <div><strong>${analytics.users}</strong><span>Users</span></div>
        <div><strong>${analytics.predictions}</strong><span>Predictions</span></div>
        <div><strong>${analytics.matchesWithResult}</strong><span>Results in</span></div>
        <div><strong>${analytics.matchesOpen}</strong><span>Open now</span></div>
      </div>
      ${top}
      <p class="muted admin-export-note">Exports include full phone numbers, picks, and points. Keep CSV files private.</p>
    </section>
  `;
}

function renderFinished(matches) {
  if (!matches.length) {
    return `
      <section class="card">
        <div class="board-title"><h2>Finished matches</h2></div>
        <p class="muted">No full-time scores yet.</p>
      </section>
    `;
  }
  return `
    <section class="card admin-results">
      <div class="board-title"><h2>Finished matches</h2></div>
      <div class="admin-result-list">
        ${matches.map(renderFinishedMatch).join("")}
      </div>
    </section>
  `;
}

function renderFinishedMatch(match) {
  return `
    <article class="admin-result-row">
      <div class="match-top">
        <span class="pill final">final</span>
        <span class="when">${match.picks} predictions</span>
      </div>
      <h3 class="fixture">${esc(match.fixture)}</h3>
      <p class="venue">${esc(match.kickoffLabel)} · ${esc(match.venue)}</p>
      <p class="admin-ft">Blasters <b>${esc(match.kbfcScore)}–${esc(match.opponentScore)}</b></p>
      <p class="venue">${match.exact ?? 0} exact · ${match.correct ?? 0} correct result · ${match.pointsAwarded ?? 0} pts awarded</p>
      <div class="admin-actions">
        <button type="button" class="ghost" data-action="export-match" data-match="${esc(match.id)}">Export CSV</button>
      </div>
    </article>
  `;
}

function renderUpcoming(matches) {
  if (!matches.length) return "";
  return `
    <section class="card">
      <div class="board-title"><h2>Upcoming / awaiting result</h2></div>
      ${matches
        .map(
          (match) => `
        <article class="admin-result-row">
          <div class="match-top">
            <span class="pill ${esc(match.status)}">${esc(match.status)}</span>
            <span class="when">${match.picks} predictions</span>
          </div>
          <h3 class="fixture">${esc(match.fixture)}</h3>
          <p class="venue">${esc(match.kickoffLabel)} · ${esc(match.venue)}</p>
          <p class="muted">Full-time score not entered yet.</p>
          <div class="admin-actions">
            <button type="button" class="ghost" data-action="export-match" data-match="${esc(match.id)}">Export CSV</button>
          </div>
        </article>
      `,
        )
        .join("")}
    </section>
  `;
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const matchId = button.dataset.match;

  if (action === "export-all") {
    await downloadExport("");
    return;
  }
  if (action === "export-match") {
    await downloadExport(matchId);
  }
});

async function downloadExport(matchId) {
  showBanner("");
  try {
    const query = matchId ? `?matchId=${encodeURIComponent(matchId)}` : "";
    const res = await fetch(`/api/admin/export${query}`, {
      headers: pinHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showBanner(data.error || "Could not export.");
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const matched = /filename="([^"]+)"/.exec(disposition);
    const filename = matched?.[1] || (matchId ? `kbfc-${matchId}.csv` : "kbfc-all-predictions.csv");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    showBanner("Could not export.");
  }
}

function pinHeaders() {
  return { "x-admin-pin": sessionStorage.getItem(PIN_KEY) || pinInput.value.trim() };
}

function showBanner(text) {
  banner.hidden = !text;
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
