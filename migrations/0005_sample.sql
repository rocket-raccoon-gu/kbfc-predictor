ALTER TABLE matches ADD COLUMN publish_at TEXT;

-- Sample match. Predictions close at 8:00 pm Qatar time.
-- The 3-0 score stays hidden until 8:15 pm Qatar time.
INSERT INTO matches (id, opponent, short_name, venue, is_home, kickoff, kbfc_score, opponent_score, publish_at)
VALUES (
  'sample-oct24',
  'Sample FC',
  'Sample',
  'Sample match, Doha',
  1,
  '2026-10-24T17:01:00.000Z',
  3,
  0,
  '2026-10-24T17:15:00.000Z'
);
