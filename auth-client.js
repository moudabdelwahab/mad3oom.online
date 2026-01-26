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
        // تسجيل الخروج عشان نكسر أي Session مؤقت
        await supabase.auth.signOut();
        return {
            data: null,
            error: { message: 'Email not confirmed' }
        };
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
export async function requireAuth(requiredRole = 'user') {
    const user = await getCurrentUser();

    if (!user) {
        return null;
    }

    const userRole = user.profile?.role || 'customer';

    // إذا كان المطلوب 'admin' والمستخدم ليس 'admin'
    if (requiredRole === 'admin' && userRole !== 'admin') {
        window.location.replace('customer-dashboard.html');
        return null;
    }

    // إذا كان المستخدم 'admin' يحاول دخول صفحة 'user' أو 'customer'، نوجهه للوحة الإدارة
    if (requiredRole !== 'admin' && userRole === 'admin') {
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
