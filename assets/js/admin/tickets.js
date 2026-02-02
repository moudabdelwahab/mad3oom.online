import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';
import { subscribeToTickets, subscribeToTicketReplies, updateTicketStatus, addTicketReply, fetchTicketReplies, closeTicketWithComment } from '/tickets-service.js';
import { adminImpersonateUser } from '/auth-client.js';

let user = null;
let currentTicketId = null;
let repliesSubscription = null;
let allTickets = [];

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return;

    updateAdminUI(user);
    await loadTickets();
    subscribeToTickets(() => loadTickets());
    setupModalEvents();
    setupFilters();
}

async function loadTickets() {
    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching tickets:", error);
        return;
    }

    allTickets = tickets || [];
    updateStats();
    renderTickets(allTickets);
}

function updateStats() {
    const stats = {
        total: allTickets.length,
        open: allTickets.filter(t => t.status === 'open').length,
        inProgress: allTickets.filter(t => t.status === 'in-progress').length,
        resolved: allTickets.filter(t => t.status === 'resolved').length
    };

    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statOpen').textContent = stats.open;
    document.getElementById('statInProgress').textContent = stats.inProgress;
    document.getElementById('statResolved').textContent = stats.resolved;
}

function setupFilters() {
    const statusFilter = document.getElementById('filterStatus');
    const priorityFilter = document.getElementById('filterPriority');
    const searchInput = document.getElementById('searchInput');

    const applyFilters = () => {
        let filtered = [...allTickets];

        // فلتر الحالة
        const status = statusFilter.value;
        if (status !== 'all') {
            filtered = filtered.filter(t => t.status === status);
        }

        // فلتر الأولوية
        const priority = priorityFilter.value;
        if (priority !== 'all') {
            filtered = filtered.filter(t => t.priority === priority);
        }

        // فلتر البحث
        const search = searchInput.value.trim().toLowerCase();
        if (search) {
            filtered = filtered.filter(t => 
                t.title.toLowerCase().includes(search) ||
                t.description.toLowerCase().includes(search) ||
                t.profiles?.full_name?.toLowerCase().includes(search) ||
                t.profiles?.email?.toLowerCase().includes(search) ||
                String(t.ticket_number).includes(search)
            );
        }

        renderTickets(filtered);
    };

    statusFilter.addEventListener('change', applyFilters);
    priorityFilter.addEventListener('change', applyFilters);
    searchInput.addEventListener('input', applyFilters);
}

function renderTickets(tickets) {
    const grid = document.getElementById('ticketsGrid');
    
    if (!tickets || tickets.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <p>لا توجد تذاكر تطابق معايير البحث</p>
            </div>
        `;
        return;
    }

    const statusMap = {
        'open': 'مفتوحة',
        'in-progress': 'قيد المعالجة',
        'resolved': 'محلولة'
    };

    const priorityMap = {
        'high': { label: 'أولوية عالية', class: 'priority-high' },
        'medium': { label: 'أولوية متوسطة', class: 'priority-medium' },
        'low': { label: 'أولوية منخفضة', class: 'priority-low' }
    };

    grid.innerHTML = tickets.map(t => {
        const userName = t.profiles?.full_name || 'مستخدم';
        const userEmail = t.profiles?.email || 'لا يوجد بريد';
        const userInitial = userName[0].toUpperCase();
        const priority = priorityMap[t.priority] || priorityMap['low'];

        return `
            <div class="ticket-card" data-id="${t.id}">
                <div class="ticket-card-header">
                    <span class="ticket-number">#${t.ticket_number || '---'}</span>
                    <span class="status-badge status-${t.status}">${statusMap[t.status] || t.status}</span>
                </div>
                
                <h3 class="ticket-title">${t.title}</h3>
                <p class="ticket-description">${t.description}</p>
                
                <div class="ticket-user-info">
                    <div class="user-avatar">${userInitial}</div>
                    <div class="user-details">
                        <div class="user-name">${userName}</div>
                        <div class="user-email">${userEmail}</div>
                    </div>
                </div>
                
                <div class="ticket-footer">
                    <span class="ticket-date">${new Date(t.created_at).toLocaleDateString('ar-EG')}</span>
                    <span class="priority-badge ${priority.class}">${priority.label}</span>
                </div>
            </div>
        `;
    }).join('');

    // إضافة حدث النقر على البطاقات
    document.querySelectorAll('.ticket-card').forEach(card => {
        card.addEventListener('click', () => {
            openTicketModal(card.dataset.id);
        });
    });
}

async function openTicketModal(ticketId) {
    currentTicketId = ticketId;
    const modal = document.getElementById('ticketModal');
    
    // Fetch full ticket details
    const { data: ticket, error } = await supabase
        .from('tickets')
        .select('*, profiles(full_name, email)')
        .eq('id', ticketId)
        .single();

    if (error || !ticket) {
        alert('خطأ في جلب بيانات التذكرة');
        return;
    }

    // Fill Modal Data
    document.getElementById('modalTicketTitle').innerText = ticket.title;
    document.getElementById('modalTicketDesc').innerText = ticket.description;
    document.getElementById('modalTicketNumber').innerText = `#${ticket.ticket_number}`;
    document.getElementById('modalTicketUser').innerText = ticket.profiles?.full_name || 'مستخدم';
    document.getElementById('modalTicketEmail').innerText = ticket.profiles?.email || '';
    document.getElementById('modalTicketDate').innerText = new Date(ticket.created_at).toLocaleString('ar-EG');
    
    const statusMap = { 'open': 'مفتوحة', 'in-progress': 'قيد المعالجة', 'resolved': 'محلولة' };
    const statusEl = document.getElementById('modalTicketStatus');
    statusEl.innerText = statusMap[ticket.status] || ticket.status;
    statusEl.className = `detail-value status-badge status-${ticket.status}`;

    // Handle Image
    const imgContainer = document.getElementById('modalTicketImageContainer');
    if (ticket.image_url) {
        imgContainer.style.display = 'block';
        document.getElementById('modalTicketImage').src = ticket.image_url;
        document.getElementById('modalTicketImageLink').href = ticket.image_url;
    } else {
        imgContainer.style.display = 'none';
    }

    // Impersonate Button
    document.getElementById('impersonateUserBtn').onclick = () => impersonateUser(ticket.user_id);
    
    // Resolve Button
    const resolveBtn = document.getElementById('resolveTicketBtn');
    if (ticket.status === 'resolved') {
        resolveBtn.innerText = 'إعادة فتح التذكرة';
        resolveBtn.onclick = () => changeStatus('open');
    } else {
        resolveBtn.innerText = 'إغلاق التذكرة (تم الحل)';
        resolveBtn.onclick = () => showCloseModal();
    }

    // Load Replies
    loadReplies(ticketId);

    // Subscribe to real-time replies updates
    if (repliesSubscription) {
        repliesSubscription.unsubscribe();
    }
    repliesSubscription = subscribeToTicketReplies(ticketId, () => {
        loadReplies(ticketId);
    });

    modal.style.display = 'block';
}

async function loadReplies(ticketId) {
    const container = document.getElementById('ticketRepliesList');
    container.innerHTML = '<div style="text-align:center; padding:1rem; color:#999;">جاري تحميل الردود...</div>';
    
    try {
        const replies = await fetchTicketReplies(ticketId);
        if (!replies || replies.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:1rem; color:#999; font-size:0.8rem;">لا توجد ردود بعد.</div>';
            return;
        }

        container.innerHTML = replies.map(r => {
            const isAdmin = r.profiles?.role === 'admin';
            const typeClass = r.is_internal ? 'reply-internal' : (isAdmin ? 'reply-admin' : 'reply-user');
            const typeLabel = r.is_internal ? '<span class="internal-tag">ملاحظة داخلية</span>' : '';
            
            return `
                <div class="reply-item ${typeClass}">
                    <div class="reply-header">
                        <span style="font-weight:700;">${r.profiles?.full_name || 'مستخدم'} ${typeLabel}</span>
                        <span>${new Date(r.created_at).toLocaleString('ar-EG', {hour:'2-digit', minute:'2-digit', day:'numeric', month:'short'})}</span>
                    </div>
                    <div class="reply-content">${r.message}</div>
                </div>
            `;
        }).join('');
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        container.innerHTML = '<div style="color:red; text-align:center;">فشل تحميل الردود</div>';
    }
}

async function changeStatus(newStatus) {
    if (!currentTicketId) return;
    try {
        await updateTicketStatus(currentTicketId, newStatus);
        openTicketModal(currentTicketId); // Refresh modal
        await loadTickets(); // Refresh list
    } catch (err) {
        alert('فشل تحديث الحالة');
    }
}

function showCloseModal() {
    const closeModal = document.getElementById('closeTicketModal');
    if (closeModal) {
        closeModal.style.display = 'block';
        document.getElementById('closeTicketComment').value = '';
    }
}

async function closeTicket() {
    if (!currentTicketId) return;
    
    const comment = document.getElementById('closeTicketComment').value.trim();
    
    try {
        await closeTicketWithComment(currentTicketId, comment);
        document.getElementById('closeTicketModal').style.display = 'none';
        openTicketModal(currentTicketId); // Refresh modal
        await loadTickets(); // Refresh list
    } catch (err) {
        alert('فشل إغلاق التذكرة: ' + err.message);
    }
}

function setupModalEvents() {
    const modal = document.getElementById('ticketModal');
    const closeBtn = document.getElementById('closeModal');
    
    closeBtn.onclick = () => {
        modal.style.display = 'none';
        if (repliesSubscription) {
            repliesSubscription.unsubscribe();
        }
    };
    
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
            if (repliesSubscription) {
                repliesSubscription.unsubscribe();
            }
        }
    };

    // Send Public Reply
    document.getElementById('sendPublicReply').onclick = async () => {
        const text = document.getElementById('replyText').value.trim();
        if (!text) return;
        
        try {
            await addTicketReply(currentTicketId, text, false);
            document.getElementById('replyText').value = '';
            loadReplies(currentTicketId);
            await loadTickets();
        } catch (err) {
            alert('فشل إرسال الرد');
        }
    };

    // Send Internal Note
    document.getElementById('sendInternalNote').onclick = async () => {
        const text = document.getElementById('replyText').value.trim();
        if (!text) return;
        
        try {
            await addTicketReply(currentTicketId, text, true);
            document.getElementById('replyText').value = '';
            loadReplies(currentTicketId);
        } catch (err) {
            alert('فشل إضافة الملاحظة');
        }
    };

    // Close Ticket Modal Events
    const closeTicketModal = document.getElementById('closeTicketModal');
    if (closeTicketModal) {
        const closeCloseBtn = document.getElementById('closeCloseTicketModal');
        if (closeCloseBtn) {
            closeCloseBtn.onclick = () => closeTicketModal.style.display = 'none';
        }

        document.getElementById('confirmCloseTicket').onclick = closeTicket;

        window.onclick = (event) => {
            if (event.target == closeTicketModal) {
                closeTicketModal.style.display = 'none';
            }
        };
    }
}

async function impersonateUser(id) { 
    if (!id) return alert('لا يمكن الدخول لحساب ضيف');
    const { data: targetUser } = await supabase.from('profiles').select('email').eq('id', id).single();
    const activityModule = await import('/activity-service.js');
    activityModule.logActivity('impersonate', { target_user_id: id, target_email: targetUser?.email });
    await adminImpersonateUser(id);
    location.href = '/customer-dashboard.html';
}

init();
