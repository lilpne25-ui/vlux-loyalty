-- Reversa de 0007 (solo desarrollo local; en entornos con datos, crear una migración nueva).
ALTER TABLE businesses DROP COLUMN IF EXISTS card_finish;
