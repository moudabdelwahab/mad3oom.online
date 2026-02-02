import { supabase } from './api-config.js';
import { logActivity } from './activity-service.js';
import { createNotification } from './notifications-service.js';

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
    const ticket = (data && data.length > 0) ? data[0] : null;

    if (ticket) {
        // إشعار للأدمن عند إنشاء تذكرة جديدة
        const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
        if (admins) {
            for (const admin of admins) {
                await createNotification({
                    userId: admin.id,
                    title: 'تذكرة جديدة',
                    message: `تم إنشاء تذكرة جديدة #${ticket.ticket_number}: ${ticket.title}`,
                    type: 'info',
                    link: `admin-dashboard.html?ticket=${ticket.id}`
                });
            }
        }
        await logActivity('ticket_created', { ticket_id: ticket.id, ticket_number: ticket.ticket_number });
    }

    return ticket;
}

/**
 * رفع صورة إلى Supabase Storage
 */
export async function uploadTicketImage(file) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

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
    console.log('[Tickets] Subscribing to tickets realtime updates');
    return supabase
        .channel('public:tickets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, payload => {
            console.log('[Tickets] Realtime ticket update received:', payload);
            callback(payload);
        })
        .subscribe((status) => {
            console.log('[Tickets] Tickets subscription status:', status);
        });
}

/**
 * الاشتراك في التحديثات التلقائية لردود تذكرة معينة
 */
export function subscribeToTicketReplies(ticketId, callback) {
    console.log('[Tickets] Subscribing to ticket replies for ticket:', ticketId);
    return supabase
        .channel(`public:ticket_replies:ticket_id=eq.${ticketId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_replies', filter: `ticket_id=eq.${ticketId}` }, payload => {
            console.log('[Tickets] Realtime reply received:', payload);
            callback(payload);
        })
        .subscribe((status) => {
            console.log('[Tickets] Replies subscription status:', status);
        });
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
    const { data: ticket } = await supabase.from('tickets').select('*, profiles(id)').eq('id', ticketId).single();
    
    const { error } = await supabase
        .from('tickets')
        .update({ status })
        .eq('id', ticketId);

    if (error) throw error;

    // إشعار للعميل عند تغيير حالة تذكرته
    if (ticket) {
        await createNotification({
            userId: ticket.user_id,
            title: 'تحديث حالة التذكرة',
            message: `تم تغيير حالة تذكرتك #${ticket.ticket_number} إلى: ${status}`,
            type: 'info',
            link: `customer-dashboard.html?ticket=${ticket.id}`
        });
        await logActivity('status_change', { ticket_id: ticketId, new_status: status });
    }
}

/**
 * إغلاق التذكرة مع تعليق للعميل
 */
export async function closeTicketWithComment(ticketId, closingComment) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
    
    if (!ticket) throw new Error('التذكرة غير موجودة');

    // إضافة التعليق الختامي للعميل
    if (closingComment && closingComment.trim()) {
        await addTicketReply(ticketId, closingComment, false);
    }

    // تحديث حالة التذكرة إلى resolved
    const { error } = await supabase
        .from('tickets')
        .update({ status: 'resolved' })
        .eq('id', ticketId);

    if (error) throw error;

    // إشعار للعميل بإغلاق التذكرة
    await createNotification({
        userId: ticket.user_id,
        title: 'تم إغلاق التذكرة',
        message: `تم إغلاق تذكرتك #${ticket.ticket_number}`,
        type: 'success',
        link: `customer-dashboard.html?ticket=${ticket.id}`
    });

    await logActivity('ticket_closed', { ticket_id: ticketId, ticket_number: ticket.ticket_number });
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
export async function addTicketReply(ticketId, message, isInternal = false) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
        .from('ticket_replies')
        .insert({
            ticket_id: ticketId,
            user_id: user.id,
            message: message,
            is_internal: isInternal
        });

    if (error) throw error;

    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', ticketId).single();

    // إشعار للعميل إذا كان الرد من الأدمن وليس ملاحظة داخلية
    if (!isInternal && ticket && ticket.user_id !== user.id) {
        await createNotification({
            userId: ticket.user_id,
            title: 'رد جديد على تذكرتك',
            message: `هناك رد جديد على تذكرتك #${ticket.ticket_number}`,
            type: 'success',
            link: `customer-dashboard.html?ticket=${ticket.id}`
        });
    }

    // تحديث حالة التذكرة إلى 'in-progress' إذا كانت 'open'
    await supabase
        .from('tickets')
        .update({ status: 'in-progress' })
        .eq('id', ticketId)
        .eq('status', 'open');
    
    await logActivity('ticket_reply', { ticket_id: ticketId, is_internal: isInternal });
}

/**
 * جلب ردود التذكرة
 */
export async function fetchTicketReplies(ticketId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // جلب البروفايل لمعرفة الدور
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    let query = supabase
        .from('ticket_replies')
        .select('*, profiles(full_name, role)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

    // إذا كان المستخدم ليس أدمن، نفلتر الملاحظات الداخلية
    if (!profile || profile.role !== 'admin') {
        query = query.eq('is_internal', false);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
}
