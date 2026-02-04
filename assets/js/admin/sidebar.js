import { supabase } from '/api-config.js';

export function initSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    // Load sidebar HTML - Use absolute path to ensure it works from any directory
    fetch('/assets/components/sidebar.html')
        .then(response => response.text())
        .then(html => {
            sidebarContainer.innerHTML = html;
            setupSidebarLogic();
            highlightActiveLink();
        })
        .catch(err => console.error('Error loading sidebar:', err));
}

function setupSidebarLogic() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const adminAvatarBtn = document.getElementById('adminAvatarBtn');
    const adminAvatarMenu = document.getElementById('adminAvatarMenu');
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationMenu = document.getElementById('notificationMenu');

    if (!menuToggle || !sidebar) return;

    // Notification Logic
    if (notificationBtn && notificationMenu) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = notificationMenu.style.display === 'block';
            notificationMenu.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                loadNotifications();
            }
        });

        document.getElementById('markAllReadBtn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { markAllAsRead } = await import('/notifications-service.js');
            await markAllAsRead();
            loadNotifications();
        });
    }

    async function loadNotifications() {
        const list = document.getElementById('notificationList');
        const badge = document.getElementById('notificationBadge');
        if (!list) return;

        try {
            const { fetchNotifications, markAsRead, subscribeToNotifications } = await import('/notifications-service.js');
            const notifications = await fetchNotifications();
            console.log('[Sidebar] Loaded notifications:', notifications.length);
            
            const unreadCount = notifications.filter(n => !n.is_read).length;
            if (badge) {
                badge.textContent = unreadCount;
                badge.style.display = unreadCount > 0 ? 'flex' : 'none';
            }

            if (notifications.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary); font-size: 0.85rem;">لا توجد إشعارات</div>';
                return;
            }

            list.innerHTML = notifications.map(n => `
                <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" style="padding: 12px 16px; border-bottom: 1px solid var(--color-border); cursor: pointer; transition: background 0.2s; ${n.is_read ? '' : 'background: rgba(0, 119, 204, 0.05);'}">
                    <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 4px; color: var(--color-text);">${n.title}</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-secondary); line-height: 1.4;">${n.message}</div>
                    <div style="font-size: 0.7rem; color: #999; margin-top: 6px;">${new Date(n.created_at).toLocaleString('ar-EG')}</div>
                </div>
            `).join('');

            list.querySelectorAll('.notification-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const id = item.dataset.id;
                    await markAsRead(id);
                    const notification = notifications.find(n => n.id == id);
                    if (notification && notification.link) {
                        window.location.href = notification.link;
                    } else {
                        loadNotifications();
                    }
                });
            });
        } catch (err) {
            list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-danger); font-size: 0.85rem;">فشل تحميل الإشعارات</div>';
        }
    }

    // Setup realtime subscription for notifications
    let notificationSubscription = null;
    async function setupNotificationRealtime() {
        const { subscribeToNotifications } = await import('/notifications-service.js');
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user && !notificationSubscription) {
            console.log('[Sidebar] Setting up realtime notifications for user:', user.id);
            notificationSubscription = subscribeToNotifications(user.id, (newNotification) => {
                console.log('[Sidebar] New notification received:', newNotification);
                // Reload notifications to show the new one
                loadNotifications();
                
                // Show browser notification if supported
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification(newNotification.title, {
                        body: newNotification.message,
                        icon: '/assets/images/logo.png'
                    });
                }
            });
        }
    }

    // Initial load for badge and setup realtime
    loadNotifications();
    setupNotificationRealtime();
    checkAdminForErrorTracker();

    const toggleSidebar = () => {
        sidebar.classList.toggle('active');
        sidebarOverlay.classList.toggle('active');
    };

    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar();
    });
    
    if (sidebarClose) sidebarClose.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

    // Avatar Menu Logic
    if (adminAvatarBtn && adminAvatarMenu) {
        adminAvatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = adminAvatarMenu.style.display === 'block';
            adminAvatarMenu.style.display = isVisible ? 'none' : 'block';
        });

        document.addEventListener('click', () => {
            adminAvatarMenu.style.display = 'none';
            if (notificationMenu) notificationMenu.style.display = 'none';
        });
    }

    // Handle logout
    const adminSignOut = document.getElementById('adminSignOut');
    const sidebarSignOut = document.getElementById('sidebarSignOut');
    
    const onLogout = async (e) => {
        e.preventDefault();
        // Dynamic import to avoid circular dependency
        const { handleLogout } = await import('./auth.js');
        await handleLogout();
    };

    if (adminSignOut) adminSignOut.addEventListener('click', onLogout);
    if (sidebarSignOut) sidebarSignOut.addEventListener('click', onLogout);
}

async function checkAdminForErrorTracker() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && (user.role === 'admin' || user.user_metadata?.is_admin)) {
        const errorLink = document.getElementById('errorTrackerLink');
        if (errorLink) errorLink.style.display = 'flex';
    }
}

function highlightActiveLink() {
    const currentPath = window.location.pathname;
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    
    sidebarItems.forEach(item => {
        const href = item.getAttribute('href');
        if (!href || href === '#') return;

        // Clean paths for comparison
        const cleanPath = currentPath.replace(/\/$/, '');
        const cleanHref = href.replace(/\/$/, '');

        // Check if current path ends with href or if it's the dashboard
        if (cleanPath.endsWith(cleanHref) || 
           (cleanPath === '' && cleanHref === '/admin-dashboard.html') ||
           (cleanPath.endsWith('/admin/') && cleanHref.endsWith('/admin/dashboard.html')) ||
           (cleanPath.endsWith('/admin/dashboard.html') && cleanHref.endsWith('/admin-dashboard.html'))) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}
