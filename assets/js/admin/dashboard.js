import { supabase } from '../../api-config.js';
import { checkAdminAuth, updateAdminUI, handleLogout } from './auth.js';
import { initSidebar } from './sidebar.js';
import { fetchTicketStats, subscribeToTickets } from '../../tickets-service.js';
import { adminImpersonateUser } from '../../auth-client.js';

let user = null;

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return;

    updateAdminUI(user);
    setupEventListeners();
    renderTickets();
    subscribeToTickets(() => renderTickets());
}

function setupEventListeners() {
    const adminAvatarBtn = document.getElementById('adminAvatarBtn');
    const adminAvatarMenu = document.getElementById('adminAvatarMenu');
    const adminSignOut = document.getElementById('adminSignOut');

    if (adminAvatarBtn && adminAvatarMenu) {
        // Since sidebar is loaded dynamically, we might need to delegate or wait
        // But for now, we'll try to attach if they exist, or use delegation on document
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#adminAvatarBtn');
            if (btn) {
                e.stopPropagation();
                adminAvatarMenu.style.display = adminAvatarMenu.style.display === 'block' ? 'none' : 'block';
            } else {
                adminAvatarMenu.style.display = 'none';
            }
        });
    }

    document.addEventListener('click', async (e) => {
        if (e.target.id === 'adminSignOut') {
            e.preventDefault();
            await handleLogout();
        }
    });
}

async function renderTickets() {
    const body = document.getElementById('admTicketsBody');
    if (!body) return;

    const { data: tickets } = await supabase
        .from('tickets')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(10); // Only show recent for dashboard

    body.innerHTML = tickets?.map(t => `
        <tr>
            <td>${t.profiles?.full_name || 'مستخدم'}</td>
            <td>${t.title}</td>
            <td><span class="status-badge status-${t.status}">${t.status}</span></td>
            <td>${new Date(t.created_at).toLocaleDateString('ar-EG')}</td>
            <td><button class="btn btn-primary btn-sm impersonate-btn" data-user-id="${t.user_id}">دخول</button></td>
        </tr>
    `).join('') || '<tr><td colspan="5">لا توجد تذاكر</td></tr>';

    // Add listeners for impersonate buttons
    document.querySelectorAll('.impersonate-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-user-id');
            await impersonateUser(userId);
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
    const activityModule = await import('../../activity-service.js');
    activityModule.logActivity('impersonate', { target_user_id: id, target_email: targetUser?.email });
    await adminImpersonateUser(id);
    location.href = '../customer-dashboard.html';
}

init();
