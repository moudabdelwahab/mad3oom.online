import { supabase } from './api-config.js';

/**
 * جلب التذاكر
 * ملاحظة: سياسات RLS في Supabase ستضمن أن العميل يرى تذاكره فقط، والأدمن يرى الجميع.
 */
export async function fetchUserTickets(filters = {}) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // جلب البروفايل لمعرفة الدور
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    let query = supabase
        .from('tickets')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false });

    // إذا كان المستخدم عميلاً، نفلتر التذاكر الخاصة به فقط
    // ملاحظة: RLS قد تقوم بذلك تلقائياً، ولكن هذا التأكيد إضافي
    if (profile && profile.role !== 'admin') {
        query = query.eq('user_id', user.id);
    }

    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    if (filters.priority) {
        query = query.eq('priority', filters.priority);
    }

    if (filters.search) {
        query = query.ilike('title', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

/**
 * إنشاء تذكرة جديدة
 * ملاحظة: لا نمرر user_id يدوياً، Supabase سيعتمد على auth.uid() عبر RLS أو Default Value.
 */
export async function createTicket({ title, description, priority }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
        .from('tickets')
        .insert({
            user_id: user.id,
            title,
            description,
            priority,
            status: 'open'
        });

    if (error) throw error;
}

/**
 * جلب إحصائيات التذاكر
 * ملاحظة: تعتمد أيضاً على RLS لضمان دقة الأرقام حسب صلاحية المستخدم.
 */
export async function fetchTicketStats() {
    const { data, error } = await supabase
        .from('tickets')
        .select('status');

    if (error) throw error;

    return {
        total: data.length,
        open: data.filter(t => t.status === 'open').length,
        inProgress: data.filter(t => t.status === 'in-progress').length,
        resolved: data.filter(t => t.status === 'resolved').length
    };
}

/**
 * تحديث حالة التذكرة (للمسؤول)
 */
export async function updateTicketStatus(ticketId, status) {
    const { error } = await supabase
        .from('tickets')
        .update({ status })
        .eq('id', ticketId);

    if (error) throw error;
}

/**
 * حذف تذكرة
 */
export async function deleteTicket(ticketId) {
    const { error } = await supabase
        .from('tickets')
        .delete()
        .eq('id', ticketId);

    if (error) throw error;
}

/**
 * إضافة رد على تذكرة
 */
export async function addTicketReply(ticketId, message) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
        .from('ticket_replies')
        .insert({
            ticket_id: ticketId,
            user_id: user.id,
            message: message
        });

    if (error) throw error;

    // تحديث حالة التذكرة إلى 'in-progress' إذا كانت 'open'
    await supabase
        .from('tickets')
        .update({ status: 'in-progress' })
        .eq('id', ticketId)
        .eq('status', 'open');
}

/**
 * جلب ردود التذكرة
 */
export async function fetchTicketReplies(ticketId) {
    const { data, error } = await supabase
        .from('ticket_replies')
        .select('*, profiles(full_name, role)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
}
