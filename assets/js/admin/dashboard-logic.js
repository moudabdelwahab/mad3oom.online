import { supabase } from '/api-config.js';
import { requireAuth, logout, adminImpersonateUser } from '/auth-client.js';
import { fetchTicketStats, subscribeToTickets } from '/tickets-service.js';
import { initSidebar } from './sidebar.js';

let user = null;

async function init() {
    initSidebar();
    setupEventListeners();
    try {
        user = await requireAuth('admin');
        if (!user) return; 
        
        updateUIWithUserData();
        renderTickets();
        subscribeToTickets(() => renderTickets());
    } catch (err) {
        console.error('Init error:', err);
    }
}

function updateUIWithUserData() {
    if (user) {
        const profile = user.profile || {};
        const adminInitial = document.getElementById('adminInitial');
        const adminBadgeContainer = document.getElementById('adminBadgeContainer');
        const adminAvatarBtn = document.getElementById('adminAvatarBtn');

        if (adminInitial) adminInitial.textContent = (profile.full_name || user.email).charAt(0).toUpperCase();
        if (profile.role === 'admin' && adminBadgeContainer) adminBadgeContainer.style.display = 'block';
        
        if (profile.avatar_url && adminAvatarBtn) {
            const navAvatar = document.createElement('img');
            navAvatar.src = profile.avatar_url;
            navAvatar.className = 'nav-avatar';
            adminAvatarBtn.innerHTML = '';
            adminAvatarBtn.appendChild(navAvatar);
        }
    }
}

async function renderTickets() {
    const body = document.getElementById('admTicketsBody');
    if (!body) return;

    const { data: tickets } = await supabase.from('tickets').select('*, profiles(full_name, email)').order('created_at', { ascending: false });
    
    body.innerHTML = tickets?.map(t => `
        <tr>
            <td>${t.profiles?.full_name || 'مستخدم'}</td>
            <td>${t.title}</td>
            <td><span class="status-badge status-${t.status}">${t.status}</span></td>
            <td>${new Date(t.created_at).toLocaleDateString('ar-EG')}</td>
            <td><button class="btn btn-primary btn-sm impersonate-btn" data-user-id="${t.user_id}">دخول</button></td>
        </tr>
    `).join('') || '<tr><td colspan="5">لا توجد تذاكر</td></tr>';

    // Add event listeners to the buttons since we removed inline onclick
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

function setupEventListeners() {
    // We use event delegation or wait for sidebar to load for elements inside it
    document.addEventListener('click', async (e) => {
        // Avatar Menu Toggle
        const avatarBtn = e.target.closest('#adminAvatarBtn');
        const avatarMenu = document.getElementById('adminAvatarMenu');
        
        if (avatarBtn && avatarMenu) {
            e.stopPropagation();
            avatarMenu.style.display = avatarMenu.style.display === 'block' ? 'none' : 'block';
        } else if (avatarMenu) {
            avatarMenu.style.display = 'none';
        }

        // Sign Out
        if (e.target.id === 'adminSignOut' || e.target.id === 'sidebarSignOut' || e.target.closest('#sidebarSignOut')) {
            e.preventDefault();
            await logout();
            window.location.replace('sign-in.html');
        }
    });
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
