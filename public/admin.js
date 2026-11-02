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
  app.innerHTML = renderAnalytics(data.analytics) + data.matches.map(renderMatch).join("");
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
    : `<p class="muted">Season points appear here after full-time scores are saved.</p>`;

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

function renderMatch(match) {
  const kbfc = match.kbfcScore ?? "";
  const opponent = match.opponentScore ?? "";
  const scored =
    match.exact != null
      ? `<p class="venue">${match.exact} exact · ${match.correct} correct result · ${match.pointsAwarded} pts awarded</p>`
      : "";
  return `
    <article class="card">
      <div class="match-top">
        <span class="pill ${match.status}">${esc(match.status)}</span>
        <span class="when">${match.picks} predictions</span>
      </div>
      <h2 class="fixture">${esc(match.fixture)}</h2>
      <p class="venue">${esc(match.kickoffLabel)} · ${esc(match.venue)}</p>
      ${scored}
      <div class="admin-row">
        <label>Blasters
          <input data-role="kbfc" data-match="${esc(match.id)}" inputmode="numeric" value="${esc(kbfc)}" />
        </label>
        <label>Opponent
          <input data-role="opp" data-match="${esc(match.id)}" inputmode="numeric" value="${esc(opponent)}" />
        </label>
      </div>
      <div class="admin-actions">
        <button type="button" class="btn" data-action="save" data-match="${esc(match.id)}">Save result</button>
        <button type="button" class="ghost" data-action="clear" data-match="${esc(match.id)}">Clear result</button>
        <button type="button" class="ghost" data-action="export-match" data-match="${esc(match.id)}">Export CSV</button>
      </div>
    </article>
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
    return;
  }
  if (action === "clear") {
    if (!window.confirm("Remove the full-time score for this match?")) return;
    await send({ matchId, clear: true }, button);
    return;
  }
  if (action !== "save") return;

  const kbfc = valueFor(matchId, "kbfc").trim();
  const opp = valueFor(matchId, "opp").trim();
  if (kbfc === "" || opp === "") {
    showBanner("Enter the Blasters score and the opponent score.");
    return;
  }
  await send({ matchId, kbfcScore: Number(kbfc), opponentScore: Number(opp) }, button);
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

async function send(body, button) {
  button.disabled = true;
  showBanner("");
  try {
    const res = await fetch("/api/admin/result", {
      method: "POST",
      headers: { "content-type": "application/json", ...pinHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      showBanner(data.error || "Could not save the result.");
      button.disabled = false;
      return;
    }
    await load();
  } catch {
    button.disabled = false;
    showBanner("Could not save the result.");
  }
}

function valueFor(matchId, role) {
  return app.querySelector(`[data-role="${role}"][data-match="${CSS.escape(matchId)}"]`)?.value ?? "";
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
