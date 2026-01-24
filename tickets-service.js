import { supabase } from './api-config.js';

/**
 * جلب التذاكر
 * ملاحظة: سياسات RLS في Supabase ستضمن أن العميل يرى تذاكره فقط، والأدمن يرى الجميع.
 */
export async function fetchUserTickets(filters = {}) {
    let query = supabase
        .from('tickets')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false });

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
    const { error } = await supabase
        .from('tickets')
        .insert({
            title,
            description,
            priority,
            status: 'open' // الحالة الافتراضية
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
