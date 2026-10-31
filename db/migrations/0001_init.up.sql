-- VLUX Loyalty V0.2 · esquema inicial multiempresa.
-- Se ejecuta con el usuario dueño del esquema (DATABASE_ADMIN_URL). La aplicación usa el rol vlux_app,
-- que no es dueño de las tablas ni tiene BYPASSRLS, por lo que Row Level Security le aplica siempre.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vlux_app') THEN
    CREATE ROLE vlux_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% es de solo inserción', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege'; END $$;

-- Negocio activo de la transacción (lo fija la API con SET LOCAL app.business_id).
CREATE OR REPLACE FUNCTION current_business_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.business_id', true), '')::uuid
$$;

-- ---------- Globales (sin RLS: la API siempre filtra por clave exacta) ----------
CREATE TABLE businesses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  city          text NOT NULL DEFAULT '' CHECK (char_length(city) <= 80),
  vertical      text NOT NULL DEFAULT 'otro' CHECK (vertical IN ('cafeteria','barberia','salon','restaurante','otro')),
  primary_color text NOT NULL DEFAULT '#2B1B14' CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color  text NOT NULL DEFAULT '#C9A15B' CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  review_url    text CHECK (review_url IS NULL OR (review_url ~ '^https://[^\s]+$' AND char_length(review_url) <= 500)),
  is_demo       boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER businesses_updated BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE staff_users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL CHECK (char_length(email) BETWEEN 5 AND 254 AND email = lower(email)),
  password_hash  text NOT NULL,
  display_name   text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  failed_logins  integer NOT NULL DEFAULT 0,
  locked_until   timestamptz,
  disabled_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX staff_users_email_key ON staff_users (email);
CREATE TRIGGER staff_users_updated BEFORE UPDATE ON staff_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE staff_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  user_id     uuid NOT NULL REFERENCES staff_users(id),
  role        text NOT NULL CHECK (role IN ('OWNER','EMPLOYEE')),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
CREATE INDEX staff_memberships_user ON staff_memberships (user_id);
CREATE TRIGGER staff_memberships_updated BEFORE UPDATE ON staff_memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE staff_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    bytea NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES staff_users(id),
  membership_id uuid NOT NULL REFERENCES staff_memberships(id),
  business_id   uuid NOT NULL REFERENCES businesses(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);
CREATE INDEX staff_sessions_user ON staff_sessions (user_id);

-- ---------- Por negocio (con RLS) ----------
CREATE TABLE reward_rules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             uuid NOT NULL REFERENCES businesses(id),
  version                 integer NOT NULL CHECK (version >= 1),
  stamps_required         integer NOT NULL CHECK (stamps_required BETWEEN 3 AND 15),
  stamp_mode              text NOT NULL CHECK (stamp_mode IN ('per_purchase','per_item')),
  max_stamps_per_purchase integer NOT NULL DEFAULT 1 CHECK (max_stamps_per_purchase BETWEEN 1 AND 10),
  visit_window_minutes    integer NOT NULL DEFAULT 120 CHECK (visit_window_minutes BETWEEN 15 AND 720),
  reward_description      text NOT NULL CHECK (char_length(reward_description) BETWEEN 3 AND 80),
  active                  boolean NOT NULL DEFAULT true,
  created_by              uuid REFERENCES staff_users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, version),
  UNIQUE (id, business_id)
);
CREATE UNIQUE INDEX reward_rules_one_active ON reward_rules (business_id) WHERE active;

CREATE TABLE customers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            uuid NOT NULL REFERENCES businesses(id),
  display_name           text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  contact                text CHECK (contact IS NULL OR char_length(contact) <= 120),
  contact_type           text CHECK (contact_type IN ('whatsapp','email')),
  marketing_consent      boolean NOT NULL DEFAULT false,
  privacy_notice_version text NOT NULL,
  privacy_accepted_at    timestamptz NOT NULL,
  anonymized_at          timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, business_id),
  CHECK ((contact IS NULL) = (contact_type IS NULL)),
  CHECK (NOT marketing_consent OR contact IS NOT NULL)
);
CREATE INDEX customers_business ON customers (business_id, created_at);
CREATE TRIGGER customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id),
  customer_id      uuid NOT NULL,
  public_code      text NOT NULL UNIQUE CHECK (public_code ~ '^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$'),
  stamp_balance    integer NOT NULL DEFAULT 0 CHECK (stamp_balance >= 0),
  cycle            integer NOT NULL DEFAULT 1 CHECK (cycle >= 1),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  last_visit_at    timestamptz,
  last_purchase_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, business_id),
  FOREIGN KEY (customer_id, business_id) REFERENCES customers (id, business_id)
);
CREATE INDEX cards_business ON cards (business_id, updated_at DESC);
CREATE TRIGGER cards_updated BEFORE UPDATE ON cards FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Acceso del cliente a SU tarjeta (sin contraseña). Solo se guarda el hash del token.
CREATE TABLE card_access_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   bytea NOT NULL UNIQUE,
  card_id      uuid NOT NULL,
  business_id  uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  FOREIGN KEY (card_id, business_id) REFERENCES cards (id, business_id)
);

CREATE TABLE visits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  card_id     uuid NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL REFERENCES staff_users(id),
  UNIQUE (id, business_id),
  FOREIGN KEY (card_id, business_id) REFERENCES cards (id, business_id)
);
CREATE INDEX visits_card ON visits (card_id, started_at DESC);
CREATE INDEX visits_business ON visits (business_id, started_at);

CREATE TABLE purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL,
  card_id         uuid NOT NULL,
  visit_id        uuid NOT NULL,
  rule_id         uuid NOT NULL,
  item_count      integer NOT NULL CHECK (item_count BETWEEN 1 AND 50),
  stamps_awarded  integer NOT NULL CHECK (stamps_awarded BETWEEN 0 AND 10),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 100),
  staff_user_id   uuid NOT NULL REFERENCES staff_users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, idempotency_key),
  UNIQUE (id, business_id),
  FOREIGN KEY (card_id, business_id) REFERENCES cards (id, business_id),
  FOREIGN KEY (visit_id, business_id) REFERENCES visits (id, business_id),
  FOREIGN KEY (rule_id, business_id) REFERENCES reward_rules (id, business_id)
);
CREATE INDEX purchases_card ON purchases (card_id, created_at DESC);
CREATE INDEX purchases_business ON purchases (business_id, created_at);

CREATE TABLE rewards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL,
  card_id       uuid NOT NULL,
  rule_id       uuid NOT NULL,
  code          text NOT NULL UNIQUE CHECK (code ~ '^R-[2-9A-HJKMNP-Z]{6}$'),
  description   text NOT NULL,
  stamps_cost   integer NOT NULL CHECK (stamps_cost > 0),
  cycle         integer NOT NULL,
  status        text NOT NULL DEFAULT 'available' CHECK (status IN ('available','redeemed','void')),
  unlocked_at   timestamptz NOT NULL DEFAULT now(),
  redeemed_at   timestamptz,
  redeemed_by   uuid REFERENCES staff_users(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, business_id),
  FOREIGN KEY (card_id, business_id) REFERENCES cards (id, business_id),
  FOREIGN KEY (rule_id, business_id) REFERENCES reward_rules (id, business_id),
  CHECK ((status = 'redeemed') = (redeemed_at IS NOT NULL AND redeemed_by IS NOT NULL))
);
-- Garantía en BD: como máximo una recompensa disponible por tarjeta.
CREATE UNIQUE INDEX rewards_one_available ON rewards (card_id) WHERE status = 'available';
CREATE INDEX rewards_business ON rewards (business_id, status);
CREATE TRIGGER rewards_updated BEFORE UPDATE ON rewards FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Libro mayor de sellos (solo inserción). stamp_balance de cards es su resumen.
CREATE TABLE stamp_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id   uuid NOT NULL,
  card_id       uuid NOT NULL,
  delta         integer NOT NULL CHECK (delta <> 0),
  reason        text NOT NULL CHECK (reason IN ('purchase','redemption')),
  purchase_id   uuid,
  reward_id     uuid,
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  staff_user_id uuid REFERENCES staff_users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (card_id, business_id) REFERENCES cards (id, business_id),
  FOREIGN KEY (purchase_id, business_id) REFERENCES purchases (id, business_id),
  FOREIGN KEY (reward_id, business_id) REFERENCES rewards (id, business_id),
  CHECK ((reason = 'purchase' AND purchase_id IS NOT NULL AND reward_id IS NULL AND delta > 0)
      OR (reason = 'redemption' AND reward_id IS NOT NULL AND purchase_id IS NULL AND delta < 0))
);
CREATE INDEX stamp_events_card ON stamp_events (card_id, id);
CREATE INDEX stamp_events_business ON stamp_events (business_id, created_at);
CREATE TRIGGER stamp_events_append_only BEFORE UPDATE OR DELETE ON stamp_events FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE review_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL,
  card_id     uuid NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('prompt_shown','link_opened','dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (card_id, business_id) REFERENCES cards (id, business_id)
);
CREATE UNIQUE INDEX review_events_prompt_once ON review_events (card_id, kind) WHERE kind IN ('prompt_shown','dismissed');
CREATE INDEX review_events_business ON review_events (business_id, kind);

CREATE TABLE audit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id),
  actor_type  text NOT NULL CHECK (actor_type IN ('staff','customer','platform','system')),
  actor_id    uuid,
  action      text NOT NULL CHECK (char_length(action) BETWEEN 3 AND 60),
  entity_type text,
  entity_id   uuid,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_business ON audit_events (business_id, created_at DESC);
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------- Row Level Security ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reward_rules','customers','cards','visits','purchases','rewards','stamp_events','review_events','audit_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id())', t);
  END LOOP;
END $$;

-- ---------- Permisos mínimos del rol de la aplicación ----------
GRANT SELECT, INSERT, UPDATE ON businesses, staff_users, staff_memberships, staff_sessions, card_access_tokens,
  reward_rules, customers, cards, visits, purchases, rewards TO vlux_app;
GRANT SELECT, INSERT ON stamp_events, review_events, audit_events TO vlux_app;
GRANT EXECUTE ON FUNCTION current_business_id() TO vlux_app;
