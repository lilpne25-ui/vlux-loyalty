-- V0.4.1 · Acabado de la tarjeta (configuración oficial guardada del negocio).
-- Solo agrega una columna con valor por omisión: no reescribe ni borra datos.
ALTER TABLE businesses
  ADD COLUMN card_finish text NOT NULL DEFAULT 'signature'
  CONSTRAINT businesses_card_finish_check CHECK (card_finish IN ('signature', 'silver', 'black'));
