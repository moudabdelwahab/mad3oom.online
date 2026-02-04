import { supabase } from './api-config.js';

/**
 * جلب إشعارات المستخدم الحالي فقط
 */
export async function fetchNotifications() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // نضمن دائماً فلترة الإشعارات حسب معرف المستخدم الحالي
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('[Notifications] Error fetching notifications:', error);
        throw error;
    }
    return data;
}

/**
 * تحديد إشعار كمقروء
 */
export async function markAsRead(notificationId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id); // ضمان الأمان: لا يمكن للمستخدم تحديث إشعار غير خاص به

    if (error) throw error;
}

/**
 * تحديد كل الإشعارات كمقروءة للمستخدم الحالي
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
 * إنشاء إشعار جديد
 */
export async function createNotification({ userId, title, message, type = 'info', link = null }) {
    if (!userId) return;

    const { error } = await supabase
        .from('notifications')
        .insert({
            user_id: userId,
            title,
            message,
            type,
            link
        });

    if (error) {
        console.error('[Notifications] Error creating notification:', error);
        throw error;
    }
}

/**
 * الاشتراك في الإشعارات اللحظية للمستخدم الحالي
 */
export function subscribeToNotifications(userId, callback) {
    if (!userId) return null;
    
    console.log('[Notifications] Subscribing to notifications for user:', userId);
    
    const channel = supabase
        .channel(`user-notifications-${userId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'notifications',
            filter: `user_id=eq.${userId}`
        }, payload => {
            console.log('[Notifications] Realtime notification received:', payload);
            callback(payload.new);
        })
        .subscribe((status) => {
            console.log('[Notifications] Subscription status:', status);
        });
    
    return channel;
}
