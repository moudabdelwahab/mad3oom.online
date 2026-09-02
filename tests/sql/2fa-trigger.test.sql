-- Executed regression test for migrations/006_2fa_change_requires_challenge.sql.
-- Models the parts of the live schema the trigger depends on: auth.uid()
-- resolved from the request JWT claim (exactly as Supabase defines it), and
-- the three 2FA columns on public.profiles.
\set ON_ERROR_STOP on
\pset tuples_only on

CREATE SCHEMA IF NOT EXISTS auth;

-- Supabase's real definition.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE public.profiles (
  id                 uuid PRIMARY KEY,
  email              text,
  role               text NOT NULL DEFAULT 'user',
  points             int  NOT NULL DEFAULT 0,
  whatsapp_enabled   boolean NOT NULL DEFAULT false,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  two_factor_secret  text,
  recovery_codes     text[]
);

\echo '--- applying migrations/006 ---'
\i migrations/006_2fa_change_requires_challenge.sql

INSERT INTO public.profiles (id, email, two_factor_enabled, two_factor_secret, recovery_codes)
VALUES ('11111111-1111-4111-8111-111111111111', 'victim@example.com',
        true, 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', ARRAY['AAAA111111','BBBB222222']);

INSERT INTO public.profiles (id, email, two_factor_enabled, two_factor_secret)
VALUES ('22222222-2222-4222-8222-222222222222', 'newuser@example.com', false, NULL);

\echo ''
\echo '=== B) ATTACKER: has the password, so has a session (auth.uid() set), but has NOT completed 2FA ==='
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

\echo '-- B1 disable 2FA outright (the exact reported bypass) --'
DO $$ BEGIN
  UPDATE public.profiles SET two_factor_enabled = false, two_factor_secret = NULL, recovery_codes = NULL
   WHERE id = '11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'FAIL: the bypass still works';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS B1: blocked';
END $$;

\echo '-- B2 null only the secret (login.html gate needs BOTH, so this alone would bypass) --'
DO $$ BEGIN
  UPDATE public.profiles SET two_factor_secret = NULL WHERE id = '11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'FAIL: nulling the secret still works';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS B2: blocked';
END $$;

\echo '-- B3 rotate the secret to one the attacker controls --'
DO $$ BEGIN
  UPDATE public.profiles SET two_factor_secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
   WHERE id = '11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'FAIL: secret rotation still works';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS B3: blocked';
END $$;

\echo '-- B4 wipe recovery codes --'
DO $$ BEGIN
  UPDATE public.profiles SET recovery_codes = NULL WHERE id = '11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'FAIL: recovery-code wipe still works';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS B4: blocked';
END $$;

\echo '-- B5 the row must be untouched after all four attempts --'
DO $$ DECLARE ok boolean; BEGIN
  SELECT two_factor_enabled AND two_factor_secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
         AND recovery_codes = ARRAY['AAAA111111','BBBB222222']
    INTO ok FROM public.profiles WHERE id = '11111111-1111-4111-8111-111111111111';
  IF NOT ok THEN RAISE EXCEPTION 'FAIL: row was mutated'; END IF;
  RAISE NOTICE 'PASS B5: 2FA state intact';
END $$;

\echo ''
\echo '=== A) LEGITIMATE FLOWS MUST STILL WORK ==='

\echo '-- A1 enrollment: user with 2FA off turns it on from the browser --'
SET request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
UPDATE public.profiles
   SET two_factor_enabled = true, two_factor_secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
       recovery_codes = ARRAY['CCCC333333']
 WHERE id = '22222222-2222-4222-8222-222222222222';
DO $$ DECLARE ok boolean; BEGIN
  SELECT two_factor_enabled INTO ok FROM public.profiles WHERE id='22222222-2222-4222-8222-222222222222';
  IF NOT ok THEN RAISE EXCEPTION 'FAIL: enrollment blocked'; END IF;
  RAISE NOTICE 'PASS A1: enrollment works';
END $$;

\echo '-- A2 unrelated self-service profile edits are untouched --'
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
UPDATE public.profiles SET email = 'victim+new@example.com'
 WHERE id = '11111111-1111-4111-8111-111111111111';
\echo 'PASS A2: unrelated column update allowed'

\echo '-- A3 an UPDATE that re-sends the SAME 2FA values is not a change --'
UPDATE public.profiles
   SET two_factor_enabled = true, two_factor_secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
 WHERE id = '11111111-1111-4111-8111-111111111111';
\echo 'PASS A3: no-op 2FA write allowed (IS DISTINCT FROM)'

\echo '-- A4 admin changing an unrelated column on a 2FA-enabled row --'
UPDATE public.profiles SET role = 'super_user', points = 50
 WHERE id = '11111111-1111-4111-8111-111111111111';
\echo 'PASS A4: role/points update allowed'

\echo '-- A5 the sanctioned disable path: service role has no auth.uid() --'
RESET request.jwt.claim.sub;
UPDATE public.profiles
   SET two_factor_enabled = false, two_factor_secret = NULL, recovery_codes = NULL
 WHERE id = '11111111-1111-4111-8111-111111111111';
DO $$ DECLARE en boolean; BEGIN
  SELECT two_factor_enabled INTO en FROM public.profiles WHERE id='11111111-1111-4111-8111-111111111111';
  IF en THEN RAISE EXCEPTION 'FAIL: service-role disable was blocked'; END IF;
  RAISE NOTICE 'PASS A5: disable-2fa (service role) can still turn it off';
END $$;

\echo '-- A6 pg_cron-style write with no claim set --'
UPDATE public.profiles SET whatsapp_enabled = false WHERE two_factor_enabled = false;
\echo 'PASS A6: cron-style bulk update allowed'
\echo ''
\echo 'ALL 2FA TRIGGER TESTS PASSED'

\echo ''
\echo '=== A6 / A7 guards (migrations 007 + 008) ==='
-- 007/008 call these; the base model above does not define them.
CREATE OR REPLACE FUNCTION public.is_main_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE IF NOT EXISTS public.user_reports (id uuid primary key, user_id uuid, status text, estimated_points int, actual_points int, approved_at timestamptz);
CREATE TABLE IF NOT EXISTS public.user_wallets (user_id uuid primary key, total_points int, available_points int, pending_points int, is_pro boolean, membership_level text, pro_badge_earned_at timestamptz, updated_at timestamptz);
CREATE TABLE IF NOT EXISTS public.reward_activity_logs (id serial primary key, user_id uuid, activity_type text, details jsonb);
CREATE OR REPLACE FUNCTION public.calc_membership_level(p int) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'bronze'::text $$;
\i migrations/007_guard_profile_role_change.sql
\i migrations/008_guard_profile_points_change.sql
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111', true);
  BEGIN
    UPDATE public.profiles SET role='admin' WHERE id='11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'FAIL: self role escalation still works';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS A6: self role change blocked';
  END;
  BEGIN
    UPDATE public.profiles SET points=999999 WHERE id='11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'FAIL: self points manipulation still works';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS A7: self points change blocked';
  END;
  PERFORM set_config('request.jwt.claim.sub','', true);
END $$;
\echo 'A6/A7 GUARDS VERIFIED'
