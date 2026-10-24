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

const KBFC_LOGO = "/kbfc.png";

const OPPONENT_LOGOS: Record<string, string> = {
  "Inter Kashi": "/logos/inter-kashi.webp",
  "NorthEast United": "/logos/northeast-united.webp",
  "Mumbai City": "/logos/mumbai-city.webp",
  "Chennaiyin FC": "/logos/chennaiyin.webp",
  "FC Goa": "/logos/fc-goa.png",
  "Churchill Brothers": "/logos/churchill-brothers.png",
  "SC Delhi": "/logos/sc-delhi.svg",
  "Punjab FC": "/logos/punjab.svg",
  "Odisha FC": "/logos/odisha.svg",
  "Bengaluru FC": "/logos/bengaluru.svg",
  "Mohun Bagan Super Giant": "/logos/mohun-bagan.svg",
  "East Bengal FC": "/logos/east-bengal.svg",
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
    return bootstrap(env, url.searchParams.get("phone") ?? "", url.searchParams.get("country") ?? "");
  }
  if (url.pathname === "/api/user" && request.method === "GET") {
    return lookupUser(env, url.searchParams.get("phone") ?? "", url.searchParams.get("country") ?? "");
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

async function bootstrap(env: Env, rawPhone: string, rawCountry = ""): Promise<Response> {
  const phone = normalizePhone(rawPhone, rawCountry);
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
      closesAt: new Date(closesAt(match.kickoff)).toISOString(),
      closeLabel: formatClock(new Date(closesAt(match.kickoff)).toISOString()),
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
    user: user ? { name: user.name, phoneMask: maskPhone(user.phone), member: user.whatsapp_member === 1 } : null,
    matches: matchViews,
    leaderboard: boards.leaderboard,
    matchBoards: boards.matchBoards,
  });
}

async function lookupUser(env: Env, rawPhone: string, rawCountry = ""): Promise<Response> {
  const phone = normalizePhone(rawPhone, rawCountry);
  if (!phone) return json({ exists: false });
  const user = await findUser(env, phone);
  if (!user) return json({ exists: false });
  return json({ exists: true, name: user.name, phone: user.phone, phoneMask: maskPhone(user.phone) });
}

async function predict(env: Env, body: Record<string, unknown> | null): Promise<Response> {
  if (!body) return err(400, "Enter a score to predict.");
  const phone = normalizePhone(String(body.phone ?? ""), String(body.countryCode ?? ""));
  const kbfcScore = parseScore(body.kbfcScore);
  const opponentScore = parseScore(body.opponentScore);
  const matchId = String(body.matchId ?? "");

  if (!phone) return err(400, "Only Qatar numbers can predict. Use +974 and an 8-digit mobile number.");
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

  const member = isChecked(body.member);
  const existing = await findUser(env, phone);
  let name = existing?.name ?? "";
  if (!existing) {
    const cleaned = cleanName(String(body.name ?? ""));
    if (!cleaned) return err(400, "Add your name. New predictors only do this once.");
    if (!member) return err(400, "Confirm you are in the Manjappada Qatar WhatsApp group.");
    name = cleaned;
    try {
      await env.DB.prepare(
        "INSERT INTO users (phone, name, created_at, whatsapp_member) VALUES (?, ?, ?, 1)",
      )
        .bind(phone, name, new Date().toISOString())
        .run();
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      const winner = await findUser(env, phone);
      if (!winner) throw error;
      name = winner.name;
      if (winner.whatsapp_member !== 1) await markMember(env, phone);
    }
  } else if (existing.whatsapp_member !== 1) {
    if (!member) return err(400, "Confirm you are in the Manjappada Qatar WhatsApp group.");
    await markMember(env, phone);
  }

  await env.DB.prepare(
    `INSERT INTO predictions (phone, match_id, kbfc_score, opponent_score, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(phone, match_id) DO UPDATE SET
       kbfc_score = excluded.kbfc_score,
       opponent_score = excluded.opponent_score,
       created_at = excluded.created_at`,
  )
    .bind(phone, matchId, kbfcScore, opponentScore, new Date().toISOString())
    .run();

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
    kbfcScore: number | null;
    opponentScore: number | null;
    points: number;
    exact: boolean;
    predicted: boolean;
  }>>();

  const everyone = await env.DB.prepare("SELECT phone, name FROM users").all<{ phone: string; name: string }>();
  for (const user of everyone.results) {
    season.set(user.phone, { name: user.name, phone: user.phone, points: 0, exact: 0, played: 0 });
  }
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
    const board = rowsByMatch.get(pick.match_id);
    if (board) {
      board.push({
        name: pick.name,
        phone: pick.phone,
        kbfcScore: pick.pk,
        opponentScore: pick.po,
        points: scored.points,
        exact: scored.exact,
        predicted: true,
      });
    }
  }

  const allPicks = await env.DB.prepare(
    "SELECT phone, match_id, kbfc_score AS pk, opponent_score AS po FROM predictions",
  ).all<{ phone: string; match_id: string; pk: number; po: number }>();
  const picksByPhone = new Map<string, Array<{ kickoff: string; fixture: string; home: boolean; shortName: string; kbfcScore: number; opponentScore: number }>>();
  const matchLookup = new Map(matches.map((match) => [match.id, match]));
  for (const pick of allPicks.results) {
    const match = matchLookup.get(pick.match_id);
    if (!match) continue;
    const list = picksByPhone.get(pick.phone) ?? [];
    list.push({
      kickoff: match.kickoff,
      fixture: fixtureName(match),
      home: match.is_home === 1,
      shortName: match.short_name,
      kbfcScore: pick.pk,
      opponentScore: pick.po,
    });
    picksByPhone.set(pick.phone, list);
  }

  const leaderboard = [...season.values()]
    .sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name))
    .map((row, index) => ({
      rank: index + 1,
      name: row.name,
      phoneEnd: row.phone.slice(-3),
      points: row.points,
      exact: row.exact,
      played: row.played,
      mine: row.phone === viewerPhone,
      picks: (picksByPhone.get(row.phone) ?? [])
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
        .map(({ kickoff: _kickoff, ...pick }) => pick),
    }));

  const matchBoards = finalMatches.map((match) => {
    const rows = (rowsByMatch.get(match.id) ?? [])
      .sort((a, b) => b.points - a.points || Number(b.predicted) - Number(a.predicted) || a.name.localeCompare(b.name))
      .map((row, index) => ({
        rank: index + 1,
        name: row.name,
        phoneEnd: row.phone.slice(-3),
        kbfcScore: row.kbfcScore,
        opponentScore: row.opponentScore,
        points: row.points,
        exact: row.exact,
        predicted: row.predicted,
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

async function findUser(env: Env, phone: string): Promise<{ phone: string; name: string; whatsapp_member: number } | null> {
  return env.DB.prepare("SELECT phone, name, whatsapp_member FROM users WHERE phone = ?")
    .bind(phone)
    .first<{ phone: string; name: string; whatsapp_member: number }>();
}

async function markMember(env: Env, phone: string): Promise<void> {
  await env.DB.prepare("UPDATE users SET whatsapp_member = 1 WHERE phone = ?").bind(phone).run();
}

function isChecked(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function hasResult(match: MatchRow): boolean {
  return match.kbfc_score !== null && match.opponent_score !== null;
}

const PREDICT_CUTOFF_MS = 60 * 1000;

function closesAt(kickoff: string): number {
  return Date.parse(kickoff) - PREDICT_CUTOFF_MS;
}

function matchStatus(match: MatchRow, matches: MatchRow[], now: number): "final" | "locked" | "open" | "upcoming" {
  if (hasResult(match)) return "final";
  if (now >= closesAt(match.kickoff)) return "locked";
  const next = matches.find((item) => !hasResult(item) && now < closesAt(item.kickoff));
  return next?.id === match.id ? "open" : "upcoming";
}

function fixtureName(match: { opponent: string; is_home: number }): string {
  return match.is_home === 1 ? `Kerala Blasters vs ${match.opponent}` : `${match.opponent} vs Kerala Blasters`;
}

function formatKickoff(iso: string): string {
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Qatar",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  return `${formatted} Qatar time`;
}

function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Qatar",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
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
