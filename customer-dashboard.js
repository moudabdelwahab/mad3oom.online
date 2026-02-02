// customer-dashboard.js
import { requireAuth, logout } from './auth-client.js';
import { initCustomerSidebar } from './assets/js/customer-sidebar.js';
import { initRewardsDashboard } from './rewards-dashboard.js';
import {
    fetchUserTickets,
    createTicket,
    fetchTicketStats,
    fetchTicketReplies,
    addTicketReply,
    subscribeToTickets
} from './tickets-service.js';
import {
    fetchNotifications,
    subscribeToNotifications
} from './notifications-service.js';

(async function () {

    /* ================= AUTH ================= */

    const user = await requireAuth('customer');
    if (!user) {
        window.location.replace('sign-in.html');
        return;
    }

    const isGuest = user.isGuest || false;

    // تحديث واجهة المستخدم ببيانات المستخدم
    const welcomeEl = document.getElementById('welcomeUser');
    const updateWelcomeText = () => {
        if (welcomeEl) {
            welcomeEl.textContent = isGuest
                ? 'مرحباً بك (زائر)'
                : `مرحباً، ${user.profile?.full_name || user.email?.split('@')[0] || 'مستخدم'}`;
        }
    };
    updateWelcomeText();

    // Initialize Sidebar
    initCustomerSidebar((tabName) => {
        const tabEl = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
        if (tabEl) tabEl.click();
    });

    // Initialize Rewards Dashboard
    if (!isGuest) {
        initRewardsDashboard(user);
    }

    // Update Sidebar User Info
    const updateSidebarUserInfo = () => {
        const customerInitial = document.getElementById('customerInitial');
        if (customerInitial) {
            customerInitial.textContent = (user.profile?.full_name || user.email || 'U')[0].toUpperCase();
        }
    };
    setTimeout(updateSidebarUserInfo, 500);

    /* ================= TABS LOGIC ================= */

    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (isGuest && tab.id === 'profileTab') {
                alert('هذه الميزة غير متاحة في وضع الضيف.');
                return;
            }

            const target = tab.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetContent = document.getElementById(target + 'TabContent');
            if (targetContent) targetContent.classList.add('active');
        });
    });

    /* ================= MODALS LOGIC ================= */

    const openCreateTicketBtn = document.getElementById('openCreateTicket');
    const createTicketModal = document.getElementById('createTicketModal');
    
    if (openCreateTicketBtn && createTicketModal) {
        openCreateTicketBtn.addEventListener('click', () => {
            if (isGuest) return alert('يرجى تسجيل الدخول لإنشاء تذكرة');
            createTicketModal.classList.add('active');
        });
    }

    const closeModalBtns = document.querySelectorAll('.close-modal, .modal');
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target === btn || btn.classList.contains('close-modal')) {
                const modal = btn.closest('.modal');
                if (modal) modal.classList.remove('active');
            }
        });
    });

    /* ================= TICKETS LOGIC ================= */

    let currentTicketId = null;

    async function renderStats() {
        const stats = await fetchTicketStats();
        const elements = {
            'userTotalTickets': stats.total,
            'userInProgressTickets': stats.inProgress,
            'userResolvedTickets': stats.resolved
        };

        for (const [id, val] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val ?? 0;
        }
    }

    async function renderTickets(filters = {}) {
        const list = document.getElementById('userTicketsList');
        if (!list) return;

        const tickets = await fetchUserTickets(filters);
        
        if (!tickets.length) {
            list.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #888;">لا توجد تذاكر حتى الآن</p>`;
            return;
        }

        const statusLabels = { open: 'مفتوحة', 'in-progress': 'قيد المعالجة', resolved: 'تم الحل' };

        list.innerHTML = tickets.map(t => `
            <div class="ticket-card" data-id="${t.id}" style="background: var(--color-surface); padding: 1.5rem; border-radius: 1rem; border: 1px solid var(--color-border); cursor: pointer;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                    <span style="color: var(--color-text-secondary); font-size: 0.85rem;">#${t.ticket_number || '---'}</span>
                    <span class="status-badge status-${t.status}" style="padding: 0.2rem 0.6rem; border-radius: 1rem; font-size: 0.75rem;">${statusLabels[t.status] || t.status}</span>
                </div>
                <h3 style="margin-bottom: 0.5rem; font-size: 1.1rem;">${t.title}</h3>
                <p style="color: var(--color-text-secondary); font-size: 0.85rem; margin-bottom: 1.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${t.description}</p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.8rem; color: var(--color-accent); font-weight: 700;">${t.priority === 'high' ? 'أولوية عالية' : (t.priority === 'medium' ? 'أولوية متوسطة' : 'أولوية منخفضة')}</span>
                    <span style="font-size: 0.75rem; color: var(--color-text-secondary);">${new Date(t.created_at).toLocaleDateString('ar-EG')}</span>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.ticket-card').forEach(card => {
            card.onclick = () => {
                const ticket = tickets.find(t => t.id === card.dataset.id);
                if (ticket) openTicketDetail(ticket);
            };
        });
    }

    async function openTicketDetail(ticket) {
        currentTicketId = ticket.id;
        const modal = document.getElementById('ticketDetailModal');
        if (!modal) return;

        document.getElementById('detailTicketTitle').textContent = ticket.title;
        document.getElementById('detailTicketNumber').textContent = `#${ticket.ticket_number}`;
        document.getElementById('detailTicketDesc').textContent = ticket.description;
        document.getElementById('detailTicketDate').textContent = new Date(ticket.created_at).toLocaleString('ar-EG');
        
        const statusEl = document.getElementById('detailTicketStatus');
        const statusLabels = { open: 'مفتوحة', 'in-progress': 'قيد المعالجة', resolved: 'تم الحل' };
        statusEl.textContent = statusLabels[ticket.status] || ticket.status;
        statusEl.className = `status-badge status-${ticket.status}`;
        statusEl.style.display = 'inline-block';
        statusEl.style.fontWeight = '700';

        // Image handling
        const imgContainer = document.getElementById('detailTicketImageContainer');
        const imgEl = document.getElementById('detailTicketImage');
        if (ticket.image_url) {
            imgContainer.style.display = 'block';
            imgEl.src = ticket.image_url;
        } else {
            imgContainer.style.display = 'none';
        }

        // Rating section
        const ratingSection = document.getElementById('ratingSection');
        if (ratingSection) {
            ratingSection.style.display = ticket.status === 'resolved' ? 'block' : 'none';
        }

        modal.classList.add('active');
        await loadReplies(ticket.id);
    }

    async function loadReplies(ticketId) {
        const list = document.getElementById('detailRepliesList');
        if (!list) return;

        list.innerHTML = '<div style="text-align:center; padding:1rem; color:#999;">جاري تحميل الردود...</div>';
        
        try {
            const replies = await fetchTicketReplies(ticketId);
            if (replies.length === 0) {
                list.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); font-size: 0.85rem; padding: 1rem;">لا توجد ردود بعد</p>';
                return;
            }

            list.innerHTML = replies.map(r => `
                <div class="reply-item ${r.profiles?.role === 'admin' ? 'reply-admin' : 'reply-user'}" style="margin-bottom: 1rem; padding: 0.75rem; border-radius: 0.5rem; background: var(--color-surface); border: 1px solid var(--color-border);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.75rem;">
                        <strong style="color: var(--color-accent);">${r.profiles?.role === 'admin' ? 'الدعم الفني' : (r.profiles?.full_name || 'أنت')}</strong>
                        <span style="color: var(--color-text-secondary);">${new Date(r.created_at).toLocaleString('ar-EG', {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div style="font-size: 0.85rem; line-height: 1.5;">${r.message}</div>
                </div>
            `).join('');
            list.scrollTop = list.scrollHeight;
        } catch (err) {
            list.innerHTML = '<p style="text-align:center; color:red;">فشل تحميل الردود</p>';
        }
    }

    // Send Reply
    const sendReplyBtn = document.getElementById('sendDetailReply');
    if (sendReplyBtn) {
        sendReplyBtn.onclick = async () => {
            const msgInput = document.getElementById('detailReplyText');
            const message = msgInput?.value.trim();
            if (!message || !currentTicketId) return;

            try {
                sendReplyBtn.disabled = true;
                sendReplyBtn.textContent = 'جاري الإرسال...';
                await addTicketReply(currentTicketId, message);
                msgInput.value = '';
                await loadReplies(currentTicketId);
            } catch (err) {
                alert('فشل إرسال الرد: ' + err.message);
            } finally {
                sendReplyBtn.disabled = false;
                sendReplyBtn.textContent = 'إرسال الرد';
            }
        };
    }

    // Create Ticket Form
    const createTicketForm = document.getElementById('userCreateTicketForm');
    if (createTicketForm) {
        createTicketForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('userTicketTitle')?.value;
            const description = document.getElementById('userTicketDescription')?.value;
            const priority = document.getElementById('userTicketPriority')?.value;

            try {
                const submitBtn = createTicketForm.querySelector('button[type="submit"]');
                submitBtn.disabled = true;
                submitBtn.textContent = 'جاري الإنشاء...';
                
                await createTicket({ title, description, priority });
                createTicketForm.reset();
                document.getElementById('createTicketModal')?.classList.remove('active');
                await renderStats();
                await renderTickets();
            } catch (err) {
                alert('خطأ في إنشاء التذكرة: ' + err.message);
            } finally {
                const submitBtn = createTicketForm.querySelector('button[type="submit"]');
                submitBtn.disabled = false;
                submitBtn.textContent = 'إرسال التذكرة';
            }
        });
    }

    /* ================= NOTIFICATIONS ================= */

    async function renderNotifications() {
        const list = document.getElementById('notificationsList');
        const badge = document.getElementById('notificationBadge');
        if (!list) return;

        const notifications = await fetchNotifications();
        const unreadCount = notifications.filter(n => !n.is_read).length;

        if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }

        if (notifications.length === 0) {
            list.innerHTML = '<p style="padding: 1rem; text-align: center; font-size: 0.8rem; color: var(--color-text-secondary);">لا توجد إشعارات</p>';
            return;
        }

        list.innerHTML = notifications.map(n => `
            <div class="notification-item ${n.is_read ? '' : 'unread'}" style="padding: 0.75rem; border-bottom: 1px solid var(--color-border); cursor: pointer; ${n.is_read ? '' : 'background: var(--hover-bg);'}">
                <div style="font-weight: 700; font-size: 0.85rem;">${n.title}</div>
                <div style="font-size: 0.8rem; color: var(--color-text-secondary); margin-top: 0.2rem;">${n.message}</div>
                <div style="font-size: 0.7rem; color: var(--color-text-secondary); margin-top: 0.4rem; opacity: 0.7;">${new Date(n.created_at).toLocaleString('ar-EG')}</div>
            </div>
        `).join('');
    }

    /* ================= INIT ================= */

    await renderStats();
    await renderTickets();
    await renderNotifications();

    // اشتراكات لحظية
    if (!isGuest) {
        console.log('[Customer Dashboard] Setting up realtime subscriptions for user:', user.id);
        subscribeToTickets(() => {
            console.log('[Customer Dashboard] Tickets callback triggered');
            renderStats();
            renderTickets();
            if (currentTicketId) loadReplies(currentTicketId);
        });
        subscribeToNotifications(user.id, (newNotification) => {
            console.log('[Customer Dashboard] Notification callback triggered:', newNotification);
            renderNotifications();
        });
    }

    // Logout
    const signOutLink = document.getElementById('signOutLink');
    if (signOutLink) {
        signOutLink.onclick = async (e) => {
            e.preventDefault();
            await logout();
            window.location.replace('sign-in.html');
        };
    }

})();
