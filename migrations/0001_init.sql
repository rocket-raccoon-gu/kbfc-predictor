CREATE TABLE IF NOT EXISTS users (
  phone TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  opponent TEXT NOT NULL,
  short_name TEXT NOT NULL,
  venue TEXT NOT NULL,
  is_home INTEGER NOT NULL,
  kickoff TEXT NOT NULL,
  kbfc_score INTEGER,
  opponent_score INTEGER
);

CREATE TABLE IF NOT EXISTS predictions (
  phone TEXT NOT NULL,
  match_id TEXT NOT NULL,
  kbfc_score INTEGER NOT NULL,
  opponent_score INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (phone, match_id)
);

CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);

-- Times are stored in UTC. Kickoffs below are IST (UTC+5:30).
-- Inter Kashi finished 0-2 before this contest opened.
INSERT OR IGNORE INTO matches (id, opponent, short_name, venue, is_home, kickoff, kbfc_score, opponent_score) VALUES
  ('ik-oct11', 'Inter Kashi', 'Inter Kashi', 'Balewadi Stadium, Pune', 0, '2026-10-11T11:30:00.000Z', 2, 0),
  ('neu-oct18', 'NorthEast United', 'NorthEast', 'Sarusajai Stadium, Guwahati', 0, '2026-10-18T14:00:00.000Z', NULL, NULL),
  ('mcfc-oct25', 'Mumbai City', 'Mumbai City', 'JLN Stadium, Kochi', 1, '2026-10-25T14:00:00.000Z', NULL, NULL),
  ('cfc-oct31', 'Chennaiyin FC', 'Chennaiyin', 'JLN Stadium, Chennai', 0, '2026-10-31T11:30:00.000Z', NULL, NULL),
  ('fcg-nov29', 'FC Goa', 'FC Goa', 'Fatorda Stadium, Goa', 0, '2026-11-29T11:30:00.000Z', NULL, NULL),
  ('cb-dec06', 'Churchill Brothers', 'Churchill Bros', 'JLN Stadium, Kochi', 1, '2026-12-06T11:30:00.000Z', NULL, NULL);
