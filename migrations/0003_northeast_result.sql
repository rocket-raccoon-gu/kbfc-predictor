-- NorthEast United 4-1 Kerala Blasters, 18 October 2026, Guwahati.
UPDATE matches
SET opponent_score = 4, kbfc_score = 1
WHERE id = 'neu-oct18' AND kbfc_score IS NULL;
