-- ============================================================================
-- 008_guard_profile_points_change.sql   —   A7: block self-points manipulation
--
-- ROOT CAUSE
--   Same missing WITH CHECK on profiles_update_policy as A6. Proven in an
--   isolated PostgreSQL 16 model of production: an ordinary user could set
--   their own points to any value, upward or downward.
--
-- EDGE CASE — VERIFIED AGAINST PRODUCTION BEFORE WRITING THIS
--   Can a legitimate admin approve their OWN reward report, producing a
--   legitimate self-write to profiles.points?  YES:
--     * user_reports INSERT policy is `auth.uid() = user_id`, so an admin can
--       file a report for themselves;
--     * approve_reward_report() has no self-approval guard.
--   It has not happened yet (0 of 3 reports were filed by an admin, 0 pending),
--   but it is a legitimate flow and must keep working.
--
--   Preserved with the bypass pattern already used in this project by
--   record_accounting_invoice(): a transaction-local set_config flag. The
--   exemption is therefore scoped to the inside of approve_reward_report() and
--   does NOT let an admin edit their own points through a direct PostgREST call.
--
-- WHAT STAYS WORKING (each traced and tested)
--   * points unchanged                    -> untouched, cheapest path
--   * service_role and pg_cron            -> auth.uid() IS NULL
--   * approve_reward_report()             -> transaction-local bypass flag
--   * main-admin points management        -> is_main_admin()
--   * super_user managing a subordinate   -> not a self-write; RLS still applies
--   * evaluate_badges_after_points_update -> AFTER trigger, unaffected
--   * manage_user_points / transfer_points_from_central -> write user_wallets only
--
-- ROLLBACK
--   DROP TRIGGER guard_profile_points_change ON public.profiles;
--   DROP FUNCTION public.guard_profile_points_change();
--   -- and, to drop the (harmless) bypass line from approve_reward_report,
--   -- restore it from migrations/008 history or simply leave it: the flag is
--   -- inert once the trigger is gone.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_profile_points_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.points IS NOT DISTINCT FROM OLD.points THEN
    RETURN NEW;
  END IF;

  -- service_role / background jobs
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sanctioned server-side path: set transaction-locally by
  -- approve_reward_report() immediately before its profiles write.
  IF COALESCE(current_setting('app.bypass_profile_points_guard', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Existing legitimate points management.
  IF public.is_main_admin() THEN
    RETURN NEW;
  END IF;

  -- The vulnerability: setting your own points from the browser.
  IF auth.uid() = NEW.id THEN
    RAISE EXCEPTION 'لا يمكنك تعديل نقاط حسابك بنفسك'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_profile_points_change ON public.profiles;

CREATE TRIGGER guard_profile_points_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_points_change();

-- ---------------------------------------------------------------------------
-- approve_reward_report(): identical to the deployed definition except for the
-- single PERFORM set_config(...) line marked below.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_reward_report(p_report_id uuid, p_actual_points integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_report public.user_reports;
    v_wallet public.user_wallets;
    v_new_total integer;
    v_was_pro boolean;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء متاح للأدمن فقط';
    END IF;

    IF p_actual_points IS NULL OR p_actual_points < 0 THEN
        RAISE EXCEPTION 'قيمة النقاط غير صالحة';
    END IF;

    SELECT * INTO v_report FROM public.user_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'البلاغ غير موجود';
    END IF;
    IF v_report.status <> 'pending' THEN
        RAISE EXCEPTION 'تمت مراجعة هذا البلاغ بالفعل';
    END IF;

    UPDATE public.user_reports
        SET status = 'approved', actual_points = p_actual_points, approved_at = now()
        WHERE id = p_report_id;

    INSERT INTO public.user_wallets (user_id, total_points, available_points, pending_points)
    VALUES (v_report.user_id, 0, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_wallet FROM public.user_wallets WHERE user_id = v_report.user_id FOR UPDATE;
    v_was_pro := COALESCE(v_wallet.is_pro, false);
    v_new_total := COALESCE(v_wallet.total_points, 0) + p_actual_points;

    UPDATE public.user_wallets SET
        total_points = v_new_total,
        available_points = COALESCE(available_points, 0) + p_actual_points,
        pending_points = GREATEST(0, COALESCE(pending_points, 0) - COALESCE(v_report.estimated_points, 0)),
        membership_level = public.calc_membership_level(v_new_total),
        is_pro = (v_new_total >= 1000),
        pro_badge_earned_at = CASE WHEN v_new_total >= 1000 AND NOT v_was_pro THEN now() ELSE pro_badge_earned_at END,
        updated_at = now()
        WHERE user_id = v_report.user_id;

    -- [008] Only line added. Transaction-local, so it cannot leak past this call.
    -- Needed because an admin may legitimately approve their own report, which
    -- makes the next statement a self-write to profiles.points.
    PERFORM set_config('app.bypass_profile_points_guard', 'on', true);

    UPDATE public.profiles SET points = v_new_total WHERE id = v_report.user_id;

    INSERT INTO public.reward_activity_logs (user_id, activity_type, details)
    VALUES (v_report.user_id, 'report_approved', jsonb_build_object('reportId', p_report_id, 'actualPoints', p_actual_points, 'totalPoints', v_new_total));

    RETURN jsonb_build_object(
        'report_id', p_report_id,
        'user_id', v_report.user_id,
        'total_points', v_new_total,
        'is_pro', (v_new_total >= 1000)
    );
END;
$function$;
