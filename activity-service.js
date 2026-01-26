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
