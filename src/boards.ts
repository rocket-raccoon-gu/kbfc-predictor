export type BoardMatch = {
  id: string;
  kickoff: string;
  kbfc_score: number | null;
  opponent_score: number | null;
};

const PREDICT_CUTOFF_MS = 60 * 1000;

export function hasResult(match: BoardMatch): boolean {
  return match.kbfc_score !== null && match.opponent_score !== null;
}

export function closesAt(kickoff: string): number {
  return Date.parse(kickoff) - PREDICT_CUTOFF_MS;
}

/** Next open fixture, or the latest match still waiting on a full-time score. */
export function nextMatchForBoard<T extends BoardMatch>(
  matches: T[],
  finalMatches: T[],
  now: number,
): T | null {
  const lastFinal = finalMatches.length ? finalMatches[finalMatches.length - 1] : null;
  const awaitingFt =
    [...matches]
      .reverse()
      .find(
        (match) =>
          !hasResult(match) &&
          now >= closesAt(match.kickoff) &&
          (!lastFinal || match.kickoff > lastFinal.kickoff),
      ) ?? null;
  if (awaitingFt) return awaitingFt;
  return matches.find((match) => !hasResult(match) && now < closesAt(match.kickoff)) ?? null;
}
