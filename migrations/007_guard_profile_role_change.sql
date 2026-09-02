-- ============================================================================
-- 007_guard_profile_role_change.sql   —   A6: block self-role escalation
--
-- ROOT CAUSE
--   profiles_update_policy is
--     USING ((auth.uid() = id) OR is_main_admin() OR (super_user_id = auth.uid()))
--   with NO WITH CHECK. Postgres reuses USING for the row check, and
--   `auth.uid() = id` is unaffected by which columns change, so a user could
--   PATCH their own row with {"role":"admin"} and self-promote. `role` is plain
--   text with no CHECK constraint, so any string was accepted.
--
--   Proven in an isolated PostgreSQL 16 model of production (real RLS, real
--   policies, real triggers, SET ROLE authenticated): self -> 'admin' MUTATED,
--   self -> 'support' MUTATED. Self-promotion to 'admin' makes is_admin() true,
--   which unlocks the admin-only Edge Functions that then act with service_role.
--
-- SHAPE
--   Same production-proven pattern as guard_aqar_enabled(): untouched-column
--   short-circuit, auth.uid() IS NULL exemption, privilege allowance, then raise.
--
-- WHAT STAYS WORKING (each traced and tested)
--   * role unchanged                     -> untouched, cheapest path
--   * service_role and pg_cron           -> auth.uid() IS NULL
--       (expire_stale_subscriptions demotes super_user -> user hourly)
--   * main-admin role management         -> is_main_admin()
--   * super_user managing a subordinate  -> not a self-write; RLS still applies
--   * handle_new_user()                  -> INSERT, and this is BEFORE UPDATE
--   * 'super_user' assignment            -> still governed by
--                                           check_super_user_creation(), untouched
--
-- ROLLBACK
--   DROP TRIGGER guard_profile_role_change ON public.profiles;
--   DROP FUNCTION public.guard_profile_role_change();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Common path: role not touched. Costs nothing and calls no other function.
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- No auth.uid() means service_role or a background job, not a user via the API.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- The existing legitimate role-management path.
  IF public.is_main_admin() THEN
    RETURN NEW;
  END IF;

  -- The vulnerability: changing your own role. Never legitimate on any traced path.
  IF auth.uid() = NEW.id THEN
    RAISE EXCEPTION 'لا يمكنك تغيير صلاحية حسابك بنفسك'
      USING ERRCODE = '42501';
  END IF;

  -- Anything else (e.g. a super_user managing a subordinate) is already
  -- constrained by profiles_update_policy and check_super_user_creation.
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_profile_role_change ON public.profiles;

CREATE TRIGGER guard_profile_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_role_change();
