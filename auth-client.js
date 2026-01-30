import { supabase } from './api-config.js';
import { logActivity } from './activity-service.js';

/* =========================================================
   Helpers
========================================================= */

/**
 * التحقق هل المستخدم محظور
 */
export function isUserBanned(profile) {
    if (!profile) return false;

    if (profile.ban_status === 'permanent') return true;

    if (profile.ban_status === 'temporary' && profile.ban_until) {
        return new Date(profile.ban_until) > new Date();
    }

    return false;
}

/* =========================================================
   Auth Core
========================================================= */

/**
 * تسجيل الدخول
 */
export async function signIn(email, password) {
    const result = await supabase.auth.signInWithPassword({ email, password });

    if (result.error) return result;

    // تأكيد الإيميل
    if (!result.data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        return {
            data: null,
            error: { message: 'يرجى تأكيد البريد الإلكتروني أولاً.' }
        };
    }

    // جلب البروفايل
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', result.data.user.id)
        .maybeSingle();

    // فحص الحظر
    if (isUserBanned(profile)) {
        await supabase.auth.signOut();
        return {
            data: null,
            error: { message: 'تم حظر هذا الحساب. يرجى التواصل مع الإدارة.' }
        };
    }

    await logActivity('login', { email });

    return result;
}

/**
 * إنشاء حساب
 */
export async function signUp(email, password) {
    return await supabase.auth.signUp({ email, password });
}

/**
 * تسجيل الخروج
 */
export async function logout() {
    try {
        await logActivity('logout');
    } catch (e) {}

    localStorage.removeItem('mad3oom-guest-session');

    return await supabase.auth.signOut();
}

/* =========================================================
   Session & User
========================================================= */

/**
 * جلب المستخدم الحالي (❌ بدون Redirect)
 */
export async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    // إذا لم يوجد بروفايل، نعتبره مستخدم عادي (customer) بشكل افتراضي
    const safeProfile = profile || { id: user.id, role: 'customer', email: user.email };

    if (isUserBanned(safeProfile)) {
        return { banned: true, profile: safeProfile };
    }

    return { ...user, profile: safeProfile };
}

/* =========================================================
   Authorization (NO REDIRECTS HERE)
========================================================= */

/**
 * حماية الصفحات
 * ❌ لا Redirect
 * ✔️ ترجع user أو null فقط
 */
export async function requireAuth(requiredRole = null) {
    // Guest
    const guestSession = localStorage.getItem('mad3oom-guest-session');
    if (guestSession) return JSON.parse(guestSession);

    const user = await getCurrentUser();
    if (!user) return null;
    if (user.banned) return { banned: true };

    const role = user.profile?.role || 'customer';
    const isAdmin = role === 'admin' || role === 'support';

    // impersonation
    const params = new URLSearchParams(window.location.search);
    const impersonateId = params.get('impersonate');

    if (impersonateId && isAdmin) {
        const { data: targetProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', impersonateId)
            .maybeSingle();

        if (targetProfile) {
            return {
                id: impersonateId,
                profile: targetProfile,
                isImpersonated: true
            };
        }
    }

    // Role check
    if (requiredRole === 'admin' && !isAdmin) return null;
    if (requiredRole === 'customer' && isAdmin && !impersonateId) {
        // إذا كان أدمن يحاول دخول لوحة العميل بدون impersonation، نسمح له لكنه سيرى بياناته كأدمن
        // أو يمكن منعه حسب رغبة العميل، هنا سنسمح له لضمان عدم حدوث Loop
        return user;
    }

    return user;
}

/* =========================================================
   Impersonation (ONE redirect only)
========================================================= */

export async function adminImpersonateUser(userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    if (profile?.role !== 'admin') return false;

    window.location.replace(
        `/customer-dashboard.html?impersonate=${userId}`
    );

    return true;
}

/* =========================================================
   Profile
========================================================= */

export async function updateProfile(updates) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, ...updates })
        .select();

    if (!error) {
        await logActivity('profile_updated', updates);
    }

    return { data, error };
}

/* =========================================================
   Admin Utilities
========================================================= */

export async function adminUpdateUserRole(userId, newRole) {
    const { data, error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

    if (!error) {
        await logActivity('admin_updated_role', {
            target_user_id: userId,
            new_data: { role: newRole }
        });
    }

    return { data, error };
}

/* =========================================================
   Password & Email
========================================================= */

export async function resetPasswordEmail(email) {
    return await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password.html`
    });
}

export async function updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({
        password: newPassword
    });

    if (!error) await logActivity('password_changed');
    return { data, error };
}

export async function updateEmail(newEmail) {
    return await supabase.auth.updateUser({ email: newEmail });
}

/* =========================================================
   Guest & Redirection
   ========================================================= */

/**
 * تسجيل الدخول كضيف
 */
export async function signInAsGuest() {
    const guestId = 'guest_' + Math.random().toString(36).substr(2, 9);
    const guestUser = {
        id: guestId,
        email: `${guestId}@mad3oom.guest`,
        isGuest: true,
        profile: {
            id: guestId,
            full_name: 'زائر',
            role: 'customer',
            is_guest: true
        }
    };
    localStorage.setItem('mad3oom-guest-session', JSON.stringify(guestUser));
    await logActivity('guest_login', { guest_id: guestId });
    return guestUser;
}

/**
 * التوجيه التلقائي بناءً على حالة المصادقة
 */
export async function autoRedirect() {
    const guestSession = localStorage.getItem('mad3oom-guest-session');
    const isAuthPage = window.location.pathname.includes('sign-in.html') || 
                      window.location.pathname.includes('sign-up.html') || 
                      window.location.pathname === '/' || 
                      window.location.pathname.endsWith('index.html');

    if (guestSession) {
        if (isAuthPage) {
            window.location.replace('customer-dashboard.html');
        }
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();
        
        const role = profile?.role || 'customer';
        const isAdmin = role === 'admin' || role === 'support';

        if (isAuthPage) {
            const target = isAdmin ? 'admin-dashboard.html' : 'customer-dashboard.html';
            window.location.replace(target);
        }
    }
}
