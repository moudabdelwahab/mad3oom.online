-- ============================================================================
-- 006_2fa_change_requires_challenge.sql
--
-- NOT APPLIED. Authored on branch claude/mad3oom-tenancy-audit-erywvm and left
-- for a human to run. Until it is applied, the bypass below is OPEN.
--
-- THE BYPASS
--   login.html calls signInWithPassword first and challenges for the TOTP code
--   second. Between those steps the browser holds a valid session, and
--   profiles_update_policy is:
--
--     USING ((auth.uid() = id) OR is_main_admin() OR (super_user_id = auth.uid()))
--
--   with no WITH CHECK clause. So an attacker holding only the password could
--   PATCH profiles SET two_factor_enabled = false, two_factor_secret = null
--   straight through PostgREST and skip the challenge entirely. Fixing
--   verify-2fa did not help, because the attacker never calls it.
--
-- THE FIX
--   A BEFORE UPDATE trigger that refuses to let any caller WITH an auth.uid()
--   change the three 2FA columns while 2FA is currently ON. The sanctioned way
--   off is the disable-2fa Edge Function, which demands a current TOTP code or
--   a recovery code and then writes as the service role (auth.uid() IS NULL).
--
-- WHY NOT REVOKE / A NEW POLICY
--   profiles_update_policy carries several unrelated flows (self-service
--   profile edits, is_main_admin, super_user managing sub-users). Narrowing it
--   would touch all of them. A trigger scoped to three columns and one
--   direction is the smallest change that closes the path.
--
-- WHAT THIS DELIBERATELY DOES NOT BLOCK
--   * Enrollment. It starts from two_factor_enabled = false, and the guard only
--     fires when the OLD row already had 2FA on. Both security pages hide the
--     setup button while 2FA is enabled, so enrollment never runs from the
--     guarded state.
--   * Every other column on profiles. The guard uses IS DISTINCT FROM, so an
--     UPDATE that does not actually change a 2FA value passes untouched — which
--     covers role changes, points, whatsapp_enabled, and PostgREST PATCHes that
--     only carry unrelated columns.
--   * service_role and pg_cron. auth.uid() is NULL for both, e.g.
--     expire_stale_subscriptions().
--
-- AFFECTED LEGITIMATE WRITERS (traced before writing this):
--   BLOCKED, and moved to the disable-2fa Edge Function in the same commit:
--     - customer-settings-modal.js      (inline disable)
--     - 2fa-service.js  disable2FA()    (used by customer-security-settings.html
--                                        and admin-security-settings.html)
--   UNAFFECTED:
--     - customer-settings-modal.js      (enable — OLD.two_factor_enabled = false)
--     - 2fa-service.js  enable2FA()     (same)
--     - every reader: login.html, auth-client.js, admin/stats.js,
--       customer-security-settings.html, admin-security-settings.html,
--       verify-2fa (service role)
--
-- ROLLBACK
--   DROP TRIGGER enforce_2fa_change_requires_challenge ON public.profiles;
--   DROP FUNCTION public.enforce_2fa_change_requires_challenge();
--   The disable-2fa function keeps working after a rollback; it just stops
--   being the only way.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_2fa_change_requires_challenge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- service_role and pg_cron have no auth.uid(); they are the escape hatch the
  -- disable-2fa Edge Function uses.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only guard accounts where 2FA is currently ON. Enrollment is untouched.
  IF COALESCE(OLD.two_factor_enabled, false) = false THEN
    RETURN NEW;
  END IF;

  IF (NEW.two_factor_enabled IS DISTINCT FROM OLD.two_factor_enabled)
     OR (NEW.two_factor_secret IS DISTINCT FROM OLD.two_factor_secret)
     OR (NEW.recovery_codes    IS DISTINCT FROM OLD.recovery_codes)
  THEN
    RAISE EXCEPTION
      'Two-factor authentication cannot be changed directly while it is enabled. Use the disable-2fa function, which requires a current authenticator code or a recovery code.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_2fa_change_requires_challenge ON public.profiles;

CREATE TRIGGER enforce_2fa_change_requires_challenge
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_2fa_change_requires_challenge();
