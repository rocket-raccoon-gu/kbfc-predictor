import assert from "node:assert/strict";
import { test } from "node:test";
import { pointsFor } from "../src/score.ts";
import { cleanName, normalizePhone, parseScore } from "../src/validate.ts";

test("exact score is worth 8 points", () => {
  const scored = pointsFor({ kbfc: 2, opponent: 0 }, { kbfc: 2, opponent: 0 });
  assert.deepEqual(scored, { points: 8, exact: true, correct: true });
});

test("right result and wrong score is 3 points", () => {
  const scored = pointsFor({ kbfc: 1, opponent: 0 }, { kbfc: 2, opponent: 0 });
  assert.equal(scored.points, 3);
  assert.equal(scored.exact, false);
  assert.equal(scored.correct, true);
});

test("a correct draw is 3 points", () => {
  const scored = pointsFor({ kbfc: 1, opponent: 1 }, { kbfc: 0, opponent: 0 });
  assert.equal(scored.points, 3);
  assert.equal(scored.exact, false);
});

test("wrong result is 0 points", () => {
  const scored = pointsFor({ kbfc: 0, opponent: 1 }, { kbfc: 2, opponent: 0 });
  assert.equal(scored.points, 0);
  assert.equal(scored.correct, false);
});

test("only Qatar numbers with +974 are accepted", () => {
  assert.equal(normalizePhone("5015 4119", "974"), "97450154119");
  assert.equal(normalizePhone("+974 5015 4119", "+974"), "97450154119");
  assert.equal(normalizePhone("50154119"), "97450154119");
  assert.equal(normalizePhone("97450154119"), "97450154119");
  assert.equal(normalizePhone("050154119", "974"), "97450154119");
  assert.equal(normalizePhone("9876543210", "91"), null);
  assert.equal(normalizePhone("+91 98765 43210", "91"), null);
  assert.equal(normalizePhone("12345", "974"), null);
  assert.equal(normalizePhone("12", "1"), null);
});

test("names are required for new predictors", () => {
  assert.equal(cleanName("  Adhil   Rahman "), "Adhil Rahman");
  assert.equal(cleanName("A"), null);
  assert.equal(cleanName("Rahul123"), null);
});

test("scores are whole numbers from 0 to 20", () => {
  assert.equal(parseScore(2), 2);
  assert.equal(parseScore("0"), 0);
  assert.equal(parseScore("21"), null);
  assert.equal(parseScore(-1), null);
  assert.equal(parseScore(1.5), null);
});
