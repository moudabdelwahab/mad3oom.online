import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI, handleLogout } from './auth.js';
import { fetchTicketStats, subscribeToTickets } from '/tickets-service.js';
import { initSidebar } from './sidebar.js';
import { adminImpersonateUser } from '/auth-client.js';

let user = null;

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return; 
    
    updateAdminUI(user);
    renderTickets();
    subscribeToTickets(() => renderTickets());
}

async function renderTickets() {
    const body = document.getElementById('admTicketsBody');
    if (!body) return;

    const { data: tickets } = await supabase.from('tickets').select('*, profiles(full_name, email)').order('created_at', { ascending: false }).limit(10);
    
    body.innerHTML = tickets?.map(t => `
        <tr>
            <td>${t.profiles?.full_name || 'مستخدم'}</td>
            <td>${t.title}</td>
            <td><span class="status-badge status-${t.status}">${t.status}</span></td>
            <td>${new Date(t.created_at).toLocaleDateString('ar-EG')}</td>
            <td><button class="btn btn-primary btn-sm impersonate-btn" data-user-id="${t.user_id}">عرض</button></td>
        </tr>
    `).join('') || '<tr><td colspan="5">لا توجد تذاكر</td></tr>';

    document.querySelectorAll('.impersonate-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.getAttribute('data-user-id');
            impersonateUser(userId);
        });
    });
    
    const stats = await fetchTicketStats();
    const totalEl = document.getElementById('admTotal');
    const openEl = document.getElementById('admOpen');
    const resolvedEl = document.getElementById('admResolved');

    if (totalEl) totalEl.textContent = stats.total;
    if (openEl) openEl.textContent = stats.open;
    if (resolvedEl) resolvedEl.textContent = stats.resolved;
}

async function impersonateUser(id) { 
    const { data: targetUser } = await supabase.from('profiles').select('email').eq('id', id).single();
    const activityModule = await import('/activity-service.js');
    activityModule.logActivity('impersonate', { target_user_id: id, target_email: targetUser?.email });
    await adminImpersonateUser(id);
    location.href = 'customer-dashboard.html';
}

// Start the app
init();
