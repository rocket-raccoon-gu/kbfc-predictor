-- Remaining Phase 1 fixtures. Kickoffs are stored in UTC.
-- 5:00 pm IST is 2:30 pm Qatar. 7:30 pm IST is 5:00 pm Qatar.
INSERT OR IGNORE INTO matches (id, opponent, short_name, venue, is_home, kickoff, kbfc_score, opponent_score) VALUES
  ('scd-dec10', 'SC Delhi', 'SC Delhi', 'JLN Stadium, Kochi', 1, '2026-12-10T11:30:00.000Z', NULL, NULL),
  ('pfc-dec14', 'Punjab FC', 'Punjab', 'JLN Stadium, Kochi', 1, '2026-12-14T14:00:00.000Z', NULL, NULL),
  ('ofc-dec20', 'Odisha FC', 'Odisha', 'Kalinga Stadium, Bhubaneswar', 0, '2026-12-20T14:00:00.000Z', NULL, NULL),
  ('bfc-jan03', 'Bengaluru FC', 'Bengaluru', 'Sree Kanteerava Stadium, Bengaluru', 0, '2027-01-03T14:00:00.000Z', NULL, NULL),
  ('mbsg-jan10', 'Mohun Bagan Super Giant', 'Mohun Bagan', 'Vivekananda Yuba Bharati Krirangan, Kolkata', 0, '2027-01-10T11:30:00.000Z', NULL, NULL),
  ('ebfc-jan16', 'East Bengal FC', 'East Bengal', 'JLN Stadium, Kochi', 1, '2027-01-16T14:00:00.000Z', NULL, NULL);
