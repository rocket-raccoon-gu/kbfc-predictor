UPDATE matches
SET opponent_score = 0, kbfc_score = 0
WHERE id = 'cfc-oct31' AND kbfc_score IS NULL;
