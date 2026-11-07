-- Base SINTÉTICA reproducible de VLUX Loyalty (10 negocios x 300 clientes). Generada desde cero, determinista.
-- Nunca contiene datos reales: nombres "Cliente Sintético NNN", correos @example.com (RFC 2606) y teléfonos 000000xxxxx.
-- Guardas: solo corre en una base cuyo nombre empieza con "vlux_synth" y que no tenga negocios.
-- Uso: psql "$ADMIN_URL_A_vlux_synth" -v ON_ERROR_STOP=1 -f scripts/synthetic/seed-synthetic.sql
DO $seed$
DECLARE
  alpha constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  nb constant int := 10; nc constant int := 300;
  b int; c int; k int; j int;
  bid uuid; owner_id uuid; emp1 uuid; emp2 uuid; rule_id uuid; cust uuid; card uuid; vis uuid; pur uuid; rw uuid;
  n_purch int; unlocked int; redeemed int; bal int; cyc int; ts timestamptz; pcode text; h bytea; staff uuid;
  slug text; vt text[] := ARRAY['cafeteria','restaurante','barberia','salon','unas','dentista','taller','gimnasio','spa','boutique'];
  has_contact boolean; ctype text; contact text; anon boolean; seq int := 0;
BEGIN
  IF current_database() NOT LIKE 'vlux\_synth%' THEN RAISE EXCEPTION 'Rechazado: la base % no es una base sintética (debe llamarse vlux_synth*)', current_database(); END IF;
  IF EXISTS (SELECT 1 FROM businesses) THEN RAISE EXCEPTION 'Rechazado: la base ya tiene negocios'; END IF;
  FOR b IN 1..nb LOOP
    slug := format('synth-%s', lpad(b::text, 2, '0'));
    INSERT INTO businesses (slug, name, city, vertical, is_demo, synthetic_declared_at, review_url, created_at)
      VALUES (slug, format('Negocio Sintético %s', b), 'Ciudad de Prueba', vt[b], true, now(), 'https://example.com/resenas/' || slug, timestamptz '2026-09-01' + b * interval '1 hour')
      RETURNING id INTO bid;
    INSERT INTO staff_users (email, password_hash, display_name) VALUES (format('dueno%s@example.com', b), 'sintetico-no-es-un-hash-real', format('Dueño Sintético %s', b)) RETURNING id INTO owner_id;
    INSERT INTO staff_users (email, password_hash, display_name) VALUES (format('caja1-%s@example.com', b), 'sintetico-no-es-un-hash-real', format('Caja Sintética 1-%s', b)) RETURNING id INTO emp1;
    INSERT INTO staff_users (email, password_hash, display_name) VALUES (format('caja2-%s@example.com', b), 'sintetico-no-es-un-hash-real', format('Caja Sintética 2-%s', b)) RETURNING id INTO emp2;
    INSERT INTO staff_memberships (business_id, user_id, role) VALUES (bid, owner_id, 'OWNER'), (bid, emp1, 'EMPLOYEE'), (bid, emp2, 'EMPLOYEE');
    INSERT INTO reward_rules (business_id, version, stamps_required, stamp_mode, reward_description, created_by, program_name)
      VALUES (bid, 1, 8, 'per_purchase', 'Recompensa sintética', owner_id, 'Programa sintético') RETURNING id INTO rule_id;
    INSERT INTO business_subscriptions (business_id, plan_code, commercial_status, start_date, price_cents, notes)
      VALUES (bid, (SELECT p.code FROM plans p ORDER BY p.price_cents LIMIT 1), 'piloto', '2026-09-01', 0, 'sintético');
    INSERT INTO notification_settings (business_id) VALUES (bid);
    INSERT INTO audit_events (business_id, actor_type, actor_id, action, entity_type, entity_id, details) VALUES (bid, 'system', NULL, 'business.created', 'business', bid, '{"sintetico":true}');
    FOR c IN 1..nc LOOP
      seq := seq + 1;
      anon := (c % 97 = 0);
      has_contact := (NOT anon) AND (c % 4 <> 0);
      ctype := CASE WHEN c % 3 = 0 THEN 'whatsapp' ELSE 'email' END;
      contact := CASE WHEN NOT has_contact THEN NULL WHEN ctype = 'email' THEN format('cliente-%s-%s@example.com', b, c) ELSE '+52000000' || lpad(((b-1)*nc + c)::text, 5, '0') END;
      ts := timestamptz '2026-09-02' + ((b*7 + c) % 60) * interval '1 day' + (c % 24) * interval '1 hour';
      INSERT INTO customers (business_id, display_name, contact, contact_type, marketing_consent, privacy_notice_version, privacy_accepted_at, anonymized_at, created_at)
        VALUES (bid, CASE WHEN anon THEN 'Anónimo' ELSE format('Cliente Sintético %s', lpad(c::text,3,'0')) END,
                contact, CASE WHEN has_contact THEN ctype END, has_contact AND c % 2 = 0, 'sintetico-v1', ts, CASE WHEN anon THEN ts + interval '1 day' END, ts)
        RETURNING id INTO cust;
      h := decode(md5(format('card-%s-%s', b, c)), 'hex');
      pcode := ''; FOR j IN 0..7 LOOP pcode := pcode || substr(alpha, (get_byte(h, j) % 31) + 1, 1); IF j = 3 THEN pcode := pcode || '-'; END IF; END LOOP;
      INSERT INTO cards (business_id, customer_id, public_code, created_at) VALUES (bid, cust, pcode, ts) RETURNING id INTO card;
      INSERT INTO card_access_tokens (token_hash, card_id, business_id, created_at) VALUES (sha256(convert_to(format('tok-sint-%s-%s', b, c), 'utf8')), card, bid, ts);
      -- compras: 0..22, determinista
      n_purch := (get_byte(decode(md5(format('n-%s-%s', b, c)), 'hex'), 0) % 23);
      unlocked := n_purch / 8;
      redeemed := CASE WHEN unlocked = 0 THEN 0 WHEN c % 2 = 0 THEN unlocked - 1 ELSE unlocked END;
      bal := 0; cyc := 1; staff := CASE WHEN c % 2 = 0 THEN emp1 ELSE emp2 END;
      FOR k IN 1..n_purch LOOP
        ts := ts + interval '2 days' + (k % 5) * interval '1 hour';
        INSERT INTO visits (business_id, card_id, started_at, created_by) VALUES (bid, card, ts, staff) RETURNING id INTO vis;
        INSERT INTO purchases (business_id, card_id, visit_id, rule_id, item_count, stamps_awarded, idempotency_key, staff_user_id, created_at, amount_cents)
          VALUES (bid, card, vis, rule_id, 1, 1, format('sint-%s-%s-%s', b, c, k) , staff, ts, 5000 + (k * 137 % 4000)) RETURNING id INTO pur;
        bal := bal + 1;
        INSERT INTO stamp_events (business_id, card_id, delta, reason, purchase_id, balance_after, staff_user_id, created_at) VALUES (bid, card, 1, 'purchase', pur, bal, staff, ts);
        IF k % 8 = 0 THEN
          h := decode(md5(format('rw-%s-%s-%s', b, c, k)), 'hex');
          pcode := 'R-'; FOR j IN 0..5 LOOP pcode := pcode || substr(alpha, (get_byte(h, j) % 31) + 1, 1); END LOOP;
          IF (k / 8) <= redeemed THEN
            INSERT INTO rewards (business_id, card_id, rule_id, code, description, stamps_cost, cycle, status, unlocked_at, redeemed_at, redeemed_by)
              VALUES (bid, card, rule_id, pcode, 'Recompensa sintética', 8, cyc, 'redeemed', ts, ts + interval '1 hour', staff) RETURNING id INTO rw;
            bal := bal - 8;
            INSERT INTO stamp_events (business_id, card_id, delta, reason, reward_id, balance_after, staff_user_id, created_at) VALUES (bid, card, -8, 'redemption', rw, bal, staff, ts + interval '1 hour');
            cyc := cyc + 1;
          ELSE
            INSERT INTO rewards (business_id, card_id, rule_id, code, description, stamps_cost, cycle, status, unlocked_at)
              VALUES (bid, card, rule_id, pcode, 'Recompensa sintética', 8, cyc, 'available', ts);
          END IF;
        END IF;
      END LOOP;
      UPDATE cards SET stamp_balance = bal, cycle = cyc, last_purchase_at = CASE WHEN n_purch > 0 THEN ts END, last_visit_at = CASE WHEN n_purch > 0 THEN ts END WHERE id = card;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Base sintética generada: % clientes', seq;
END
$seed$;
