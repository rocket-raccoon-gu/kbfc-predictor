-- Wipe contest entries so the season board and match boards start empty again.
-- Match fixtures stay; full-time scores are cleared and can be re-entered from /admin.
DELETE FROM predictions;
DELETE FROM users;
UPDATE matches SET kbfc_score = NULL, opponent_score = NULL;
