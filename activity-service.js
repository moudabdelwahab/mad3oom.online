import { supabase } from './api-config.js';

/**
 * الحصول على معلومات الجهاز والمتصفح بشكل منسق
 */
function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = "Unknown Browser";
    let os = "Unknown OS";

    if (ua.indexOf("Chrome") > -1) browser = "Chrome";
    else if (ua.indexOf("Firefox") > -1) browser = "Firefox";
    else if (ua.indexOf("Safari") > -1) browser = "Safari";
    else if (ua.indexOf("Edge") > -1) browser = "Edge";

    if (ua.indexOf("Windows") > -1) os = "Windows";
    else if (ua.indexOf("Mac") > -1) os = "MacOS";
    else if (ua.indexOf("Android") > -1) os = "Android";
    else if (ua.indexOf("iPhone") > -1) os = "iOS";

    return `${browser} – ${os}`;
}

/**
 * الحصول على الموقع التقريبي بناءً على IP (باستخدام خدمة مجانية)
 */
async function getLocationInfo() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        return {
            country: data.country_name,
            city: data.city,
            ip: data.ip
        };
    } catch (e) {
        return null;
    }
}

/**
 * تسجيل نشاط جديد مع تفاصيل تقنية كاملة
 */
export async function logActivity(action, details = {}) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        let profile = null;
        
        if (user) {
            const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            profile = data;
        }

        const deviceInfo = getDeviceInfo();
        const location = await getLocationInfo();
        
        // حساب مدة الجلسة إذا كان الأكشن هو logout
        let sessionDuration = null;
        if (action === 'logout') {
            const loginTime = localStorage.getItem('lastLoginTime');
            if (loginTime) {
                sessionDuration = Math.floor((Date.now() - parseInt(loginTime)) / 1000); // بالثواني
                localStorage.removeItem('lastLoginTime');
            }
        } else if (action === 'login') {
            localStorage.setItem('lastLoginTime', Date.now().toString());
        }

        const { error } = await supabase
            .from('activity_logs')
            .insert({
                user_id: user?.id || null,
                user_role: profile?.role || 'guest',
                action,
                details,
                ip_address: location?.ip || null,
                user_agent: navigator.userAgent,
                device_info: deviceInfo,
                location_info: location ? { country: location.country, city: location.city } : null,
                session_duration: sessionDuration,
                created_at: new Date().toISOString()
            });

        if (error) console.error('Failed to log activity:', error);
    } catch (err) {
        console.error('Error in logActivity:', err);
    }
}

/**
 * جلب سجل النشاطات مع دعم الفلاتر (للأدمن فقط)
 */
export async function fetchActivityLogs(filters = {}, limit = 50) {
    let query = supabase
        .from('activity_logs')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false });

    if (filters.role && filters.role !== 'all') {
        query = query.eq('user_role', filters.role);
    }

    if (filters.action && filters.action !== 'all') {
        query = query.eq('action', filters.action);
    }

    const { data, error } = await query.limit(limit);

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
            let msg = `قام <strong>${name}</strong> بتسجيل الخروج.`;
            if (log.session_duration) {
                const mins = Math.floor(log.session_duration / 60);
                msg += ` (مدة الجلسة: ${mins} دقيقة)`;
            }
            return msg;
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
            return `قام الأدمن <strong>${name}</strong> بالدخول كعميل (الحساب: ${details.target_email || details.target_user_id}).`;
        case 'ban_user':
            return `قام الأدمن <strong>${name}</strong> بحظر المستخدم (الحساب: ${details.target_email || details.target_user_id}).`;
        case 'unban_user':
            return `قام الأدمن <strong>${name}</strong> بفك الحظر عن المستخدم (الحساب: ${details.target_email || details.target_user_id}).`;
        case 'admin_updated_user':
            return `قام الأدمن <strong>${name}</strong> بتحديث بيانات المستخدم (ID: ${details.target_user_id}).`;
        case 'report_submitted':
            return `قام <strong>${name}</strong> بتقديم بلاغ مكافأة جديد.`;
        default:
            return `قام <strong>${name}</strong> بإجراء: ${log.action}`;
    }
}
