import { supabase } from '../../api-config.js';
import { requireAuth, logout } from '../../auth-client.js';

export async function checkAdminAuth() {
    try {
        const user = await requireAuth('admin');
        if (!user) {
            window.location.replace('../sign-in.html');
            return null;
        }
        return user;
    } catch (err) {
        console.error('Auth error:', err);
        window.location.replace('../sign-in.html');
        return null;
    }
}

export async function handleLogout() {
    await logout();
    window.location.replace('../sign-in.html');
}

export function updateAdminUI(user) {
    if (user) {
        const profile = user.profile || {};
        const adminInitial = document.getElementById('adminInitial');
        const adminBadgeContainer = document.getElementById('adminBadgeContainer');
        const adminAvatarBtn = document.getElementById('adminAvatarBtn');

        if (adminInitial) {
            adminInitial.textContent = (profile.full_name || user.email).charAt(0).toUpperCase();
        }

        if (profile.role === 'admin' && adminBadgeContainer) {
            adminBadgeContainer.style.display = 'block';
        }

        if (profile.avatar_url && adminAvatarBtn) {
            const navAvatar = document.createElement('img');
            navAvatar.src = profile.avatar_url;
            navAvatar.className = 'nav-avatar';
            adminAvatarBtn.innerHTML = '';
            adminAvatarBtn.appendChild(navAvatar);
        }
    }
}
