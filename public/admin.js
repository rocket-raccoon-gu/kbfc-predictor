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
  app.innerHTML = data.matches.map(renderMatch).join("");
}

function renderMatch(match) {
  const kbfc = match.kbfcScore ?? "";
  const opponent = match.opponentScore ?? "";
  return `
    <article class="card">
      <div class="match-top">
        <span class="pill ${match.status}">${esc(match.status)}</span>
        <span class="when">${match.picks} predictions</span>
      </div>
      <h2 class="fixture">${esc(match.fixture)}</h2>
      <p class="venue">${esc(match.kickoffLabel)} · ${esc(match.venue)}</p>
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
      </div>
    </article>
  `;
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const matchId = button.dataset.match;
  if (button.dataset.action === "clear") {
    if (!window.confirm("Remove the full-time score for this match?")) return;
    await send({ matchId, clear: true }, button);
    return;
  }
  const kbfc = valueFor(matchId, "kbfc").trim();
  const opp = valueFor(matchId, "opp").trim();
  if (kbfc === "" || opp === "") {
    showBanner("Enter the Blasters score and the opponent score.");
    return;
  }
  await send({ matchId, kbfcScore: Number(kbfc), opponentScore: Number(opp) }, button);
});

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
