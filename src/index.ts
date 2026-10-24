import { pointsFor } from "./score";
import { cleanName, maskPhone, normalizePhone, parseScore } from "./validate";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PIN: string;
}

type MatchRow = {
  id: string;
  opponent: string;
  short_name: string;
  venue: string;
  is_home: number;
  kickoff: string;
  kbfc_score: number | null;
  opponent_score: number | null;
};

type PickRow = {
  name: string;
  phone: string;
  match_id: string;
  pk: number;
  po: number;
};

const KBFC_LOGO = "https://www.indiansuperleague.com/static-assets/images/club/498.png?v=103.48";

const OPPONENT_LOGOS: Record<string, string> = {
  "Inter Kashi": "https://www.indiansuperleague.com/static-assets/images/club/2354.png?v=103.48",
  "NorthEast United": "https://www.indiansuperleague.com/static-assets/images/club/504.png?v=103.48",
  "Mumbai City": "https://www.indiansuperleague.com/static-assets/images/club/506.png?v=103.48",
  "Chennaiyin FC": "https://www.indiansuperleague.com/static-assets/images/club/505.png?v=103.48",
  "FC Goa": "https://www.indiansuperleague.com/static-assets/images/club/496.png?v=103.48",
  "Churchill Brothers": "https://www.indiansuperleague.com/static-assets/images/club/1101.png?v=103.48",
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return env.ASSETS.fetch(new URL("/admin.html", url.origin));
    }
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        console.error(error);
        return err(500, "Something went wrong. Try again.");
      }
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/api/bootstrap" && request.method === "GET") {
    return bootstrap(env, url.searchParams.get("phone") ?? "");
  }
  if (url.pathname === "/api/user" && request.method === "GET") {
    return lookupUser(env, url.searchParams.get("phone") ?? "");
  }
  if (url.pathname === "/api/predict" && request.method === "POST") {
    return predict(env, await readJson(request));
  }
  if (url.pathname === "/api/admin/matches" && request.method === "GET") {
    const denied = assertPin(request, env);
    if (denied) return denied;
    return adminMatches(env);
  }
  if (url.pathname === "/api/admin/result" && request.method === "POST") {
    const denied = assertPin(request, env);
    if (denied) return denied;
    return saveResult(env, await readJson(request));
  }
  return err(404, "Not found.");
}

async function bootstrap(env: Env, rawPhone: string): Promise<Response> {
  const phone = normalizePhone(rawPhone);
  const user = phone ? await findUser(env, phone) : null;
  const matches = await listMatches(env);
  const picks = new Map<string, { kbfc_score: number; opponent_score: number }>();

  if (user) {
    const mine = await env.DB.prepare(
      "SELECT match_id, kbfc_score, opponent_score FROM predictions WHERE phone = ?",
    )
      .bind(user.phone)
      .all<{ match_id: string; kbfc_score: number; opponent_score: number }>();
    for (const pick of mine.results) picks.set(pick.match_id, pick);
  }

  const now = Date.now();
  const matchViews = matches.map((match) => {
    const final = hasResult(match);
    const status = matchStatus(match, matches, now);
    const pick = picks.get(match.id);
    let myPick: {
      kbfcScore: number;
      opponentScore: number;
      points: number | null;
      exact: boolean | null;
      correct: boolean | null;
    } | null = null;
    if (pick) {
      const scored = final
        ? pointsFor(
            { kbfc: pick.kbfc_score, opponent: pick.opponent_score },
            { kbfc: match.kbfc_score as number, opponent: match.opponent_score as number },
          )
        : null;
      myPick = {
        kbfcScore: pick.kbfc_score,
        opponentScore: pick.opponent_score,
        points: scored ? scored.points : null,
        exact: scored ? scored.exact : null,
        correct: scored ? scored.correct : null,
      };
    }
    return {
      id: match.id,
      opponent: match.opponent,
      shortName: match.short_name,
      venue: match.venue,
      home: match.is_home === 1,
      kickoff: match.kickoff,
      kickoffLabel: formatKickoff(match.kickoff),
      fixture: fixtureName(match),
      kbfcLogo: KBFC_LOGO,
      opponentLogo: OPPONENT_LOGOS[match.opponent] ?? "",
      status,
      kbfcScore: match.kbfc_score,
      opponentScore: match.opponent_score,
      myPick,
    };
  });

  const boards = await buildBoards(env, matches, phone ?? "");
  return json({
    user: user ? { name: user.name, phoneMask: maskPhone(user.phone) } : null,
    matches: matchViews,
    leaderboard: boards.leaderboard,
    matchBoards: boards.matchBoards,
  });
}

async function lookupUser(env: Env, rawPhone: string): Promise<Response> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return json({ exists: false });
  const user = await findUser(env, phone);
  if (!user) return json({ exists: false });
  return json({ exists: true, name: user.name, phone: user.phone, phoneMask: maskPhone(user.phone) });
}

async function predict(env: Env, body: Record<string, unknown> | null): Promise<Response> {
  if (!body) return err(400, "Enter a score to predict.");
  const phone = normalizePhone(String(body.phone ?? ""));
  const kbfcScore = parseScore(body.kbfcScore);
  const opponentScore = parseScore(body.opponentScore);
  const matchId = String(body.matchId ?? "");

  if (!phone) return err(400, "Enter a valid 10-digit mobile number.");
  if (!/^[a-z0-9-]{1,40}$/.test(matchId)) return err(400, "Pick a match first.");
  if (kbfcScore === null || opponentScore === null) {
    return err(400, "Enter both scores as whole numbers from 0 to 20.");
  }

  const match = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<MatchRow>();
  if (!match) return err(404, "That match is not on the list.");
  const matches = await listMatches(env);
  const status = matchStatus(match, matches, Date.now());
  if (status === "upcoming") return err(403, "Predictions open when this is the next match.");
  if (status !== "open") return err(403, "Predictions are closed for this match.");

  const existing = await findUser(env, phone);
  let name = existing?.name ?? "";
  if (!existing) {
    const cleaned = cleanName(String(body.name ?? ""));
    if (!cleaned) return err(400, "Add your name. New predictors only do this once.");
    name = cleaned;
    try {
      await env.DB.prepare("INSERT INTO users (phone, name, created_at) VALUES (?, ?, ?)")
        .bind(phone, name, new Date().toISOString())
        .run();
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      const winner = await findUser(env, phone);
      if (!winner) throw error;
      name = winner.name;
    }
  }

  try {
    await env.DB.prepare(
      "INSERT INTO predictions (phone, match_id, kbfc_score, opponent_score, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(phone, matchId, kbfcScore, opponentScore, new Date().toISOString())
      .run();
  } catch (error) {
    if (isUniqueError(error)) return err(409, "You already predicted this match.");
    throw error;
  }

  return json({ ok: true, name, phone, phoneMask: maskPhone(phone) });
}

async function adminMatches(env: Env): Promise<Response> {
  const matches = await listMatches(env);
  const counts = await env.DB.prepare(
    "SELECT match_id, COUNT(*) AS picks FROM predictions GROUP BY match_id",
  ).all<{ match_id: string; picks: number }>();
  const byId = new Map(counts.results.map((row) => [row.match_id, row.picks]));
  const now = Date.now();
  return json({
    matches: matches.map((match) => ({
      id: match.id,
      fixture: fixtureName(match),
      venue: match.venue,
      kickoffLabel: formatKickoff(match.kickoff),
      status: matchStatus(match, matches, now),
      kbfcScore: match.kbfc_score,
      opponentScore: match.opponent_score,
      picks: byId.get(match.id) ?? 0,
    })),
  });
}

async function saveResult(env: Env, body: Record<string, unknown> | null): Promise<Response> {
  if (!body) return err(400, "Missing result.");
  const matchId = String(body.matchId ?? "");
  if (!/^[a-z0-9-]{1,40}$/.test(matchId)) return err(400, "Unknown match.");
  const match = await env.DB.prepare("SELECT id FROM matches WHERE id = ?").bind(matchId).first();
  if (!match) return err(404, "That match is not on the list.");

  if (body.clear === true) {
    await env.DB.prepare("UPDATE matches SET kbfc_score = NULL, opponent_score = NULL WHERE id = ?")
      .bind(matchId)
      .run();
    return json({ ok: true });
  }

  const kbfcScore = parseScore(body.kbfcScore);
  const opponentScore = parseScore(body.opponentScore);
  if (kbfcScore === null || opponentScore === null) {
    return err(400, "Enter both full-time scores as whole numbers from 0 to 20.");
  }
  await env.DB.prepare("UPDATE matches SET kbfc_score = ?, opponent_score = ? WHERE id = ?")
    .bind(kbfcScore, opponentScore, matchId)
    .run();
  return json({ ok: true });
}

async function buildBoards(env: Env, matches: MatchRow[], viewerPhone: string) {
  const finalMatches = matches.filter(hasResult);
  const picks = finalMatches.length
    ? await env.DB.prepare(
        `SELECT u.name AS name, u.phone AS phone, p.match_id AS match_id,
                p.kbfc_score AS pk, p.opponent_score AS po
         FROM predictions p
         JOIN users u ON u.phone = p.phone
         WHERE p.match_id IN (${finalMatches.map(() => "?").join(",")})`,
      )
        .bind(...finalMatches.map((match) => match.id))
        .all<PickRow>()
    : { results: [] as PickRow[] };

  const season = new Map<string, { name: string; phone: string; points: number; exact: number; played: number }>();
  const rowsByMatch = new Map<string, Array<{
    name: string;
    phone: string;
    kbfcScore: number;
    opponentScore: number;
    points: number;
    exact: boolean;
  }>>();

  for (const match of finalMatches) rowsByMatch.set(match.id, []);
  const matchById = new Map(finalMatches.map((match) => [match.id, match]));

  for (const pick of picks.results) {
    const match = matchById.get(pick.match_id);
    if (!match) continue;
    const scored = pointsFor(
      { kbfc: pick.pk, opponent: pick.po },
      { kbfc: match.kbfc_score as number, opponent: match.opponent_score as number },
    );
    const agg = season.get(pick.phone) ?? { name: pick.name, phone: pick.phone, points: 0, exact: 0, played: 0 };
    agg.points += scored.points;
    agg.exact += scored.exact ? 1 : 0;
    agg.played += 1;
    season.set(pick.phone, agg);
    rowsByMatch.get(pick.match_id)?.push({
      name: pick.name,
      phone: pick.phone,
      kbfcScore: pick.pk,
      opponentScore: pick.po,
      points: scored.points,
      exact: scored.exact,
    });
  }

  const leaderboard = [...season.values()]
    .sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name))
    .map((row, index) => ({
      rank: index + 1,
      name: row.name,
      points: row.points,
      exact: row.exact,
      played: row.played,
      mine: row.phone === viewerPhone,
    }));

  const matchBoards = finalMatches.map((match) => {
    const rows = (rowsByMatch.get(match.id) ?? [])
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .map((row, index) => ({
        rank: index + 1,
        name: row.name,
        kbfcScore: row.kbfcScore,
        opponentScore: row.opponentScore,
        points: row.points,
        exact: row.exact,
        mine: row.phone === viewerPhone,
      }));
    return {
      id: match.id,
      fixture: fixtureName(match),
      kickoffLabel: formatKickoff(match.kickoff),
      kbfcScore: match.kbfc_score,
      opponentScore: match.opponent_score,
      home: match.is_home === 1,
      opponent: match.opponent,
      rows,
    };
  });

  return { leaderboard, matchBoards };
}

async function listMatches(env: Env): Promise<MatchRow[]> {
  const result = await env.DB.prepare("SELECT * FROM matches ORDER BY kickoff ASC").all<MatchRow>();
  return result.results;
}

async function findUser(env: Env, phone: string): Promise<{ phone: string; name: string } | null> {
  return env.DB.prepare("SELECT phone, name FROM users WHERE phone = ?")
    .bind(phone)
    .first<{ phone: string; name: string }>();
}

function hasResult(match: MatchRow): boolean {
  return match.kbfc_score !== null && match.opponent_score !== null;
}

function matchStatus(match: MatchRow, matches: MatchRow[], now: number): "final" | "locked" | "open" | "upcoming" {
  if (hasResult(match)) return "final";
  if (now >= Date.parse(match.kickoff)) return "locked";
  const next = matches.find((item) => !hasResult(item) && now < Date.parse(item.kickoff));
  return next?.id === match.id ? "open" : "upcoming";
}

function fixtureName(match: { opponent: string; is_home: number }): string {
  return match.is_home === 1 ? `Kerala Blasters vs ${match.opponent}` : `${match.opponent} vs Kerala Blasters`;
}

function formatKickoff(iso: string): string {
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  return `${formatted} IST`;
}

function assertPin(request: Request, env: Env): Response | null {
  if (!env.ADMIN_PIN) return err(503, "The result desk is not set up yet.");
  const pin = request.headers.get("x-admin-pin") ?? "";
  if (!safeEqual(pin, env.ADMIN_PIN)) return err(401, "Wrong PIN.");
  return null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isUniqueError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE/i.test(message);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function err(status: number, message: string): Response {
  return json({ error: message }, status);
}
