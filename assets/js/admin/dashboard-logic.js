import { supabase } from '/api-config.js';
import { requireAuth, logout, adminImpersonateUser } from '/auth-client.js';
import { fetchTicketStats, subscribeToTickets } from '/tickets-service.js';

let user = null;

async function init() {
    setupSidebar();
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

function setupSidebar() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    if (!menuToggle || !sidebar) return;

    const toggleSidebar = () => {
        sidebar.classList.toggle('active');
        sidebarOverlay.classList.toggle('active');
    };

    menuToggle.addEventListener('click', toggleSidebar);
    if (sidebarClose) sidebarClose.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);
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
    const adminAvatarBtn = document.getElementById('adminAvatarBtn');
    const adminAvatarMenu = document.getElementById('adminAvatarMenu');
    
    if (adminAvatarBtn && adminAvatarMenu) {
        adminAvatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            adminAvatarMenu.style.display = adminAvatarMenu.style.display === 'block' ? 'none' : 'block';
        });
        
        document.addEventListener('click', () => {
            adminAvatarMenu.style.display = 'none';
        });
    }

    const signoutAction = async (e) => {
        e.preventDefault();
        await logout();
        window.location.replace('sign-in.html');
    };

    const adminSignOut = document.getElementById('adminSignOut');
    const sidebarSignOut = document.getElementById('sidebarSignOut');

    if (adminSignOut) adminSignOut.addEventListener('click', signoutAction);
    if (sidebarSignOut) sidebarSignOut.addEventListener('click', signoutAction);
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
