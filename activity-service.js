import { supabase } from './api-config.js';

/**
 * تسجيل نشاط جديد
 */
export async function logActivity(action, details = {}) {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
        .from('activity_logs')
        .insert({
            user_id: user?.id || null,
            action,
            details,
            created_at: new Date().toISOString()
        });

    if (error) console.error('Failed to log activity:', error);
}

/**
 * جلب سجل النشاطات (للأدمن فقط)
 */
export async function fetchActivityLogs(limit = 50) {
    const { data, error } = await supabase
        .from('activity_logs')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data;
}

/**
 * تنسيق رسالة النشاط بناءً على نوع الأكشن
 */
export function formatActivityMessage(log) {
    const name = log.profiles?.full_name || log.profiles?.email || 'مستخدم غير معروف';
    const details = log.details || {};

    switch (log.action) {
        case 'login':
            return `قام <strong>${name}</strong> بتسجيل الدخول.`;
        case 'logout':
            return `قام <strong>${name}</strong> بتسجيل الخروج.`;
        case 'ticket_created':
            return `قام <strong>${name}</strong> بإنشاء تذكرة جديدة #${details.ticket_number || ''}.`;
        case 'ticket_reply':
            return `قام <strong>${name}</strong> بإضافة رد على التذكرة #${details.ticket_id || ''}.`;
        case 'status_change':
            return `قام <strong>${name}</strong> بتغيير حالة التذكرة إلى <strong>${details.new_status}</strong>.`;
        case 'profile_updated':
            return `قام <strong>${name}</strong> بتحديث بيانات ملفه الشخصي.`;
        case 'password_changed':
            return `قام <strong>${name}</strong> بتغيير كلمة المرور الخاصة به.`;
        case 'impersonate':
            return `قام الأدمن <strong>${name}</strong> بالدخول كعميل (ID: ${details.target_user_id}).`;
        case 'admin_updated_user':
            return `قام الأدمن <strong>${name}</strong> بتحديث بيانات المستخدم (ID: ${details.target_user_id}).`;
        default:
            return `قام <strong>${name}</strong> بإجراء: ${log.action}`;
    }
}
