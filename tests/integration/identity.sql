BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version=9 AND NOT dirty) THEN
    RAISE EXCEPTION 'identity migration not ready';
  END IF;
END $$;

INSERT INTO users (id,email,email_normalized,password_hash,display_name) VALUES
('11111111-1111-4111-8111-111111111111','Sql@Example.Test','sql@example.test','$argon2id$synthetic','SQL Test');

DO $$
BEGIN
  BEGIN
    INSERT INTO users (email,email_normalized,password_hash,display_name) VALUES
    ('SQL@example.test','sql@example.test','$argon2id$synthetic','Duplicate');
    RAISE EXCEPTION 'duplicate normalized email accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO users (email,email_normalized,password_hash,display_name) VALUES
    ('Other@example.test','OTHER@example.test','$argon2id$synthetic','Invalid');
    RAISE EXCEPTION 'unnormalized email accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

INSERT INTO auth_sessions (id,user_id,token_hash,csrf_hash,expires_at) VALUES
('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',decode(repeat('aa',32),'hex'),decode(repeat('cc',32),'hex'),now()+interval '1 day'),
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',decode(repeat('bb',32),'hex'),decode(repeat('dd',32),'hex'),now()+interval '1 day');

INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at) VALUES
('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',decode(repeat('ee',32),'hex'),now()+interval '15 minutes');

DO $$
DECLARE affected integer;
BEGIN
  UPDATE password_reset_tokens SET used_at=now() WHERE id='44444444-4444-4444-8444-444444444444' AND used_at IS NULL AND expires_at>now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'reset token not consumed'; END IF;
  UPDATE password_reset_tokens SET used_at=now() WHERE id='44444444-4444-4444-8444-444444444444' AND used_at IS NULL AND expires_at>now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'reset token replay accepted'; END IF;
  UPDATE auth_sessions SET revoked_at=now() WHERE user_id='11111111-1111-4111-8111-111111111111' AND revoked_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'sessions were not revoked'; END IF;
END $$;

ROLLBACK;
