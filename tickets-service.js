import { supabase } from './api-config.js';

/**
 * جلب التذاكر
 */
export async function fetchUserTickets(filters = {}) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // جلب البروفايل لمعرفة الدور
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    let query = supabase
        .from('tickets')
        .select('*, profiles(full_name, email, role)')
        .order('created_at', { ascending: false });

    // إذا كان المستخدم عميلاً (أو لا يوجد بروفايل بعد)، نفلتر التذاكر الخاصة به فقط
    if (!profile || profile.role !== 'admin') {
        query = query.eq('user_id', user.id);
    }

    if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
    }

    if (filters.priority && filters.priority !== 'all') {
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
 */
export async function createTicket({ title, description, priority, image_url = null }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // جلب آخر رقم تذكرة لإنشاء رقم جديد
    const { data: lastTicket } = await supabase
        .from('tickets')
        .select('ticket_number')
        .order('ticket_number', { ascending: false })
        .limit(1)
        .maybeSingle();

    const nextNumber = (lastTicket?.ticket_number || 0) + 1;

    const { data, error } = await supabase
        .from('tickets')
        .insert({
            user_id: user.id,
            title,
            description,
            priority,
            status: 'open',
            image_url,
            ticket_number: nextNumber
        })
        .select();

    if (error) throw error;
    return (data && data.length > 0) ? data[0] : null;
}

/**
 * رفع صورة إلى Supabase Storage
 */
export async function uploadTicketImage(file) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // تنظيف اسم الملف من الحروف غير الصالحة
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const bucketName = 'tickets';

    const { data, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (uploadError) {
        console.error('Upload error details:', uploadError);
        // إذا كان الخطأ بسبب عدم وجود الـ Bucket، نحاول توضيح ذلك
        if (uploadError.message?.includes('bucket not found') || uploadError.error === 'Bucket not found') {
            throw new Error(`Storage Bucket 'tickets' غير موجود. يرجى إنشاؤه في Supabase وجعله Public.`);
        }
        throw new Error(`فشل رفع الصورة: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

    return publicUrl;
}

/**
 * الاشتراك في التحديثات التلقائية للتذاكر
 */
export function subscribeToTickets(callback) {
    return supabase
        .channel('public:tickets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, payload => {
            callback(payload);
        })
        .subscribe();
}

/**
 * جلب إحصائيات التذاكر
 */
export async function fetchTicketStats() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { total: 0, open: 0, inProgress: 0, resolved: 0 };

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    let query = supabase.from('tickets').select('status');
    
    if (!profile || profile.role !== 'admin') {
        query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
        total: data.length,
        open: data.filter(t => t.status === 'open').length,
        inProgress: data.filter(t => t.status === 'in-progress').length,
        resolved: data.filter(t => t.status === 'resolved').length
    };
}

/**
 * تحديث حالة التذكرة
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
