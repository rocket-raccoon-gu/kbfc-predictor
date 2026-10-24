export type Score = { kbfc: number; opponent: number };

export function resultSign(kbfc: number, opponent: number): -1 | 0 | 1 {
  if (kbfc > opponent) return 1;
  if (kbfc < opponent) return -1;
  return 0;
}

/** Correct result is 3 points. An exact score adds 5, for 8 total. */
export function pointsFor(pick: Score, actual: Score): { points: number; exact: boolean; correct: boolean } {
  const exact = pick.kbfc === actual.kbfc && pick.opponent === actual.opponent;
  const correct = resultSign(pick.kbfc, pick.opponent) === resultSign(actual.kbfc, actual.opponent);
  let points = 0;
  if (correct) points += 3;
  if (exact) points += 5;
  return { points, exact, correct };
}
