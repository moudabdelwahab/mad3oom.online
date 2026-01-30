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
    localStorage.removeItem('mad3oom-guest-session');
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
        // إذا فشل جلب البروفايل، لا نفترض أنه عميل (customer) بل نعتبر الجلسة غير مكتملة
        return null;
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

    const isAuthPage = currentPath.endsWith('index.html') || 
                       currentPath === '/' || 
                       currentPath.endsWith('/') ||
                       currentPath.endsWith('sign-in.html') || 
                       currentPath.endsWith('sign-up.html');

    if (isAuthPage) {
        const targetPage = (userRole === 'admin' || userRole === 'support') ? 'admin-dashboard.html' : 'customer-dashboard.html';
        // تجنب التوجيه إذا كنا بالفعل في الصفحة المستهدفة
        if (!currentPath.includes(targetPage)) {
            window.location.replace(targetPage);
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

    // Activity logged in admin-dashboard.html before calling this
    const impersonateUrl = `${window.location.origin}/customer-dashboard.html?impersonate=${userId}`;
    window.open(impersonateUrl, '_blank');
}

/**
 * تسجيل الدخول كضيف
 */
export async function signInAsGuest() {
    // نستخدم معرف ثابت للضيف أو ننشئ جلسة وهمية
    const guestSession = {
        user: { id: 'guest-user', email: 'guest@mad3oom.online' },
        profile: { 
            id: 'guest-user', 
            email: 'guest@mad3oom.online', 
            role: 'guest',
            full_name: 'زائر',
            membership_level: 'زائر'
        },
        isGuest: true
    };
    
    localStorage.setItem('mad3oom-guest-session', JSON.stringify(guestSession));
    await logActivity('guest_login');
    return { data: guestSession, error: null };
}

export async function requireAuth(requiredRole = 'user') {
    const currentPath = window.location.pathname;
    const isSignInPage = currentPath.includes('sign-in.html');

    // التحقق من وجود جلسة ضيف أولاً
    const guestSessionJson = localStorage.getItem('mad3oom-guest-session');
    if (guestSessionJson) {
        const guestSession = JSON.parse(guestSessionJson);
        return guestSession;
    }

    const user = await getCurrentUser();

    if (!user) {
        if (!isSignInPage) {
            window.location.replace('sign-in.html');
        }
        return null;
    }

    const userRole = user.profile?.role || 'customer';
    const isAdminOrSupport = (userRole === 'admin' || userRole === 'support');

    const urlParams = new URLSearchParams(window.location.search);
    const impersonateId = urlParams.get('impersonate');
    
    if (impersonateId && isAdminOrSupport) {
        const { data: targetProfile } = await supabase.from('profiles').select('*').eq('id', impersonateId).single();
        if (targetProfile) {
            return { id: impersonateId, profile: targetProfile, isImpersonated: true };
        }
    }

    // منطق التوجيه بناءً على الدور المطلوب والدور الحالي
    if (requiredRole === 'admin' || requiredRole === 'support') {
        if (!isAdminOrSupport) {
            if (!currentPath.includes('customer-dashboard.html')) {
                window.location.replace('customer-dashboard.html');
            }
            return null;
        }
    } else if (requiredRole === 'customer') {
        if (isAdminOrSupport && !impersonateId) {
            if (!currentPath.includes('admin-dashboard.html')) {
                window.location.replace('admin-dashboard.html');
            }
            return null;
        }
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
    // جلب البيانات القديمة
    const { data: oldProfile } = await supabase.from('profiles').select('*').eq('id', userId).single();

    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

    if (!error) {
        // تصفية البيانات القديمة لتشمل فقط الحقول التي تم تحديثها
        const oldData = {};
        if (oldProfile) {
            Object.keys(updates).forEach(key => {
                oldData[key] = oldProfile[key];
            });
        }

        await logActivity('admin_updated_user', { 
            target_user_id: userId, 
            old_data: oldData,
            new_data: updates 
        });
    }

    return { data, error };
}

/**
 * تحديث رتبة المستخدم (للأدمن فقط)
 */
export async function adminUpdateUserRole(userId, newRole) {
    // جلب الرتبة القديمة
    const { data: oldProfile } = await supabase.from('profiles').select('role').eq('id', userId).single();

    // 1. تحديث جدول Profiles
    const { data, error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

    if (error) return { data, error };

    // 2. تحديث Auth Metadata لضمان عمل السياسات الأمنية
    const { error: authError } = await supabase.auth.admin.updateUserById(
        userId,
        { user_metadata: { role: newRole } }
    ).catch(() => ({ error: null })); // تجاهل الخطأ إذا لم تكن الصلاحيات كافية

    if (!error) {
        await logActivity('admin_updated_role', { 
            target_user_id: userId, 
            old_data: { role: oldProfile?.role },
            new_data: { role: newRole }
        });
    }

    return { data, error: error || authError };
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
