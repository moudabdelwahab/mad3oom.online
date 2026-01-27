import { supabase } from './api-config.js';
import { logActivity } from './activity-service.js';

/**
 * التحقق مما إذا كان المستخدم محظوراً
 */
export function isUserBanned(profile) {
    if (!profile) return false;
    if (profile.ban_status === 'permanent') return true;
    if (profile.ban_status === 'temporary' && profile.ban_until) {
        const banUntil = new Date(profile.ban_until);
        if (banUntil > new Date()) return true;
    }
    return false;
}

/**
 * تسجيل الدخول باستخدام البريد الإلكتروني وكلمة المرور
 */
export async function signIn(email, password) {
    const result = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (result.error) return result;

    // ⛔ منع الدخول لو الإيميل مش متفعل
    if (!result.data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        return {
            data: null,
            error: { message: 'يرجى تأكيد بريدك الإلكتروني أولاً لتتمكن من تسجيل الدخول.' }
        };
    }

    // جلب البروفايل للتحقق من الحظر
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', result.data.user.id)
        .single();

    if (isUserBanned(profile)) {
        await supabase.auth.signOut();
        let message = '';
        
        if (profile.ban_status === 'permanent') {
            message = 'تم حظر حسابك بشكل دائم.';
        } else if (profile.ban_status === 'temporary') {
            const banDate = new Date(profile.ban_until).toLocaleString('ar-EG', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            message = `تم حظر حسابك مؤقتاً حتى تاريخ: ${banDate}.`;
        }

        if (profile.ban_reason) {
            message += `\nالسبب: ${profile.ban_reason}`;
        }
        
        message += '\nيرجى التواصل مع الإدارة لفك الحظر.';
        
        return {
            data: null,
            error: { message }
        };
    }

    // حفظ الجلسة في كوكيز لضمان استمراريتها
    const session = result.data.session;
    if (session) {
        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
        document.cookie = `sb-refresh-token=${session.refresh_token}; path=/; max-age=31536000; SameSite=Lax`;
    }

    // تسجيل نشاط الدخول
    await logActivity('login', { email });

    return result;
}


/**
 * إنشاء حساب جديد
 */
export async function signUp(email, password) {
    console.log('Attempting sign up for:', email);
    const result = await supabase.auth.signUp({
        email,
        password
    });
    if (result.error) console.error('Sign up error details:', result.error);
    return result;
}

/**
 * تسجيل الخروج
 */
export async function logout() {
    await logActivity('logout');
    document.cookie = "sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
    document.cookie = "sb-refresh-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
    return await supabase.auth.signOut();
}


/**
 * الحصول على المستخدم الحالي مع البروفايل الخاص به
 */
export async function getCurrentUser() {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (profileError) {
        console.error('Error fetching profile:', profileError);
        return { ...user, profile: null };
    }

    // إذا كان المستخدم محظوراً أثناء الجلسة، قم بتسجيل خروجه
    if (isUserBanned(profile)) {
        await logout();
        window.location.replace('sign-in.html?error=banned');
        return null;
    }

    return { ...user, profile };
}

/**
 * وظيفة بديلة لـ getCurrentUser تستخدم في index.html
 */
export async function currentSession() {
    return await getCurrentUser();
}

/**
 * التوجيه التلقائي بناءً على حالة الجلسة والدور
 */
export async function autoRedirect() {
    const user = await getCurrentUser();
    if (!user) return;

    const userRole = user.profile?.role || 'customer';
    const currentPath = window.location.pathname;

    if (currentPath.endsWith('index.html') || currentPath === '/' || currentPath.endsWith('sign-in.html') || currentPath.endsWith('sign-up.html')) {
        if (userRole === 'admin') {
            window.location.replace('admin-dashboard.html');
        } else {
            window.location.replace('customer-dashboard.html');
        }
    }
}

/**
 * ميزة دخول الإدمن على حساب العميل
 */
export async function adminImpersonateUser(userId) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    
    if (profile?.role !== 'admin') {
        throw new Error('Unauthorized');
    }

    await logActivity('impersonate', { target_user_id: userId });
    const impersonateUrl = `${window.location.origin}/customer-dashboard.html?impersonate=${userId}`;
    window.open(impersonateUrl, '_blank');
}

export async function requireAuth(requiredRole = 'user') {
    const user = await getCurrentUser();

    if (!user) {
        if (!window.location.pathname.endsWith('sign-in.html')) {
            window.location.replace('sign-in.html');
        }
        return null;
    }

    const userRole = user.profile?.role || 'customer';

    const urlParams = new URLSearchParams(window.location.search);
    const impersonateId = urlParams.get('impersonate');
    
    if (impersonateId && (userRole === 'admin' || userRole === 'support')) {
        const { data: targetProfile } = await supabase.from('profiles').select('*').eq('id', impersonateId).single();
        if (targetProfile) {
            return { id: impersonateId, profile: targetProfile, isImpersonated: true };
        }
    }

    if (requiredRole === 'admin' && userRole !== 'admin') {
        window.location.replace('customer-dashboard.html');
        return null;
    }

    if (requiredRole === 'support' && userRole !== 'admin' && userRole !== 'support') {
        window.location.replace('customer-dashboard.html');
        return null;
    }

    if (requiredRole === 'customer' && (userRole === 'admin' || userRole === 'support') && !impersonateId) {
        window.location.replace('admin-dashboard.html');
        return null;
    }

    return user;
}

/**
 * تحديث بيانات البروفايل
 */
export async function updateProfile(updates) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user logged in');

    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

    if (!error) {
        await logActivity('profile_updated', updates);
    }

    return { data, error };
}

/**
 * تحديث بروفايل مستخدم آخر (للأدمن فقط)
 */
export async function adminUpdateUserProfile(userId, updates) {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

    if (!error) {
        await logActivity('admin_updated_user', { target_user_id: userId, updates });
    }

    return { data, error };
}

/**
 * رفع صورة البروفايل
 */
export async function uploadAvatar(file) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
        });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

    return publicUrl;
}

/**
 * إرسال بريد إعادة تعيين كلمة المرور
 */
export async function resetPasswordEmail(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html',
    });
    return { data, error };
}

/**
 * تحديث كلمة المرور
 */
export async function updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({
        password: newPassword
    });
    if (!error) {
        await logActivity('password_changed');
    }
    return { data, error };
}

/**
 * تحديث البريد الإلكتروني
 */
export async function updateEmail(newEmail) {
    const { data, error } = await supabase.auth.updateUser({
        email: newEmail
    });
    return { data, error };
}
