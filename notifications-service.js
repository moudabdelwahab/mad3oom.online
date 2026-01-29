import { supabase } from './api-config.js';

/**
 * جلب إشعارات المستخدم الحالي
 */
export async function fetchNotifications() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) throw error;
    return data;
}

/**
 * تحديد إشعار كمقروء
 */
export async function markAsRead(notificationId) {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

    if (error) throw error;
}

/**
 * تحديد كل الإشعارات كمقروءة
 */
export async function markAllAsRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

    if (error) throw error;
}

/**
 * إنشاء إشعار جديد (يستخدم غالباً من جانب السيرفر أو الأدمن)
 */
export async function createNotification({ userId, title, message, type = 'info', link = null }) {
    const { error } = await supabase
        .from('notifications')
        .insert({
            user_id: userId,
            title,
            message,
            type,
            link
        });

    if (error) throw error;
}

/**
 * الاشتراك في الإشعارات اللحظية
 */
export function subscribeToNotifications(userId, callback) {
    return supabase
        .channel(`user-notifications-${userId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'notifications',
            filter: `user_id=eq.${userId}`
        }, payload => {
            callback(payload.new);
        })
        .subscribe();
}
