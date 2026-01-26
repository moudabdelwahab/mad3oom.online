import { supabase } from './api-config.js';

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
            error: { message: 'Email not confirmed' }
        };
    }

    // حفظ الجلسة في كوكيز لضمان استمراريتها
    const session = result.data.session;
    if (session) {
        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
        document.cookie = `sb-refresh-token=${session.refresh_token}; path=/; max-age=31536000; SameSite=Lax`;
    }

    return result;
}


/**
 * إنشاء حساب جديد
 * ملاحظة: يتم إنشاء البروفايل تلقائياً عبر Trigger في Supabase
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
    // مسح الكوكيز عند تسجيل الخروج
    document.cookie = "sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
    document.cookie = "sb-refresh-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
    return await supabase.auth.signOut();
}


/**
 * الحصول على المستخدم الحالي مع البروفايل الخاص به من جدول profiles
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

    return { ...user, profile };
}

/**
 * وظيفة بديلة لـ getCurrentUser تستخدم في index.html
 */
export async function currentSession() {
    return await getCurrentUser();
}

/**
 * حماية الصفحات بناءً على الدور (Role) المسترجع من قاعدة البيانات
 */
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
 * ميزة دخول الإدمن على حساب العميل في جلسة منفصلة
 */
export async function adminImpersonateUser(userId) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    
    if (profile?.role !== 'admin') {
        throw new Error('Unauthorized');
    }

    // فتح نافذة جديدة مع بارامتر خاص للتمثيل
    const impersonateUrl = `${window.location.origin}/customer-dashboard.html?impersonate=${userId}`;
    window.open(impersonateUrl, '_blank');
}

export async function requireAuth(requiredRole = 'user') {
    const user = await getCurrentUser();

    if (!user) {
        // إذا لم يكن هناك مستخدم، نوجهه لصفحة تسجيل الدخول
        if (!window.location.pathname.endsWith('sign-in.html')) {
            window.location.replace('sign-in.html');
        }
        return null;
    }

    const userRole = user.profile?.role || 'customer';

    // التحقق من وجود بارامتر التمثيل (Impersonation)
    const urlParams = new URLSearchParams(window.location.search);
    const impersonateId = urlParams.get('impersonate');
    
    if (impersonateId && userRole === 'admin') {
        // إذا كان إدمن ويقوم بالتمثيل، نجلب بيانات العميل المستهدف
        const { data: targetProfile } = await supabase.from('profiles').select('*').eq('id', impersonateId).single();
        if (targetProfile) {
            return { id: impersonateId, profile: targetProfile, isImpersonated: true };
        }
    }

    // إذا كان المطلوب 'admin' والمستخدم ليس 'admin'
    if (requiredRole === 'admin' && userRole !== 'admin') {
        window.location.replace('customer-dashboard.html');
        return null;
    }

    // إذا كان المستخدم 'admin' يحاول دخول صفحة 'customer' بدون تمثيل، نوجهه للوحة الإدارة
    if (requiredRole === 'customer' && userRole === 'admin' && !impersonateId) {
        window.location.replace('admin-dashboard.html');
        return null;
    }

    return user;
}

/**
 * تحديث بيانات البروفايل
 * مسموح فقط للحقول التي تسمح بها سياسات RLS (مثل full_name, phone)
 */
export async function updateProfile(updates) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user logged in');

    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

    return { data, error };
}

/**
 * إرسال بريد إعادة تعيين كلمة المرور
 */
export async function resetPasswordEmail(email) {
    console.log('Attempting to send reset email to:', email);
    // تأكد من توجيه المستخدم لصفحة reset-password.html بعد النقر على الرابط في البريد
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html',
    });
    if (error) console.error('Reset email error:', error);
    return { data, error };
}

/**
 * تحديث كلمة المرور (تستخدم بعد النقر على رابط الإيميل)
 */
export async function updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({
        password: newPassword
    });
    return { data, error };
}

/**
 * تحديث البريد الإلكتروني
 * ملاحظة: سيتطلب تأكيد البريد الجديد عبر رابط يصل إليه
 */
export async function updateEmail(newEmail) {
    const { data, error } = await supabase.auth.updateUser({
        email: newEmail
    });
    return { data, error };
}
