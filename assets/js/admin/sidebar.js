export function initSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    // Load sidebar HTML
    fetch('../assets/components/sidebar.html')
        .then(response => response.text())
        .then(html => {
            sidebarContainer.innerHTML = html;
            setupSidebarLogic();
            highlightActiveLink();
        });
}

function setupSidebarLogic() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const adminAvatarBtn = document.getElementById('adminAvatarBtn');
    const adminAvatarMenu = document.getElementById('adminAvatarMenu');

    if (!menuToggle || !sidebar) return;

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
        });
    }

    // Handle logout
    const adminSignOut = document.getElementById('adminSignOut');
    const sidebarSignOut = document.getElementById('sidebarSignOut');
    
    const onLogout = async (e) => {
        e.preventDefault();
        const { handleLogout } = await import('./auth.js');
        await handleLogout();
    };

    if (adminSignOut) adminSignOut.addEventListener('click', onLogout);
    if (sidebarSignOut) sidebarSignOut.addEventListener('click', onLogout);
}

function highlightActiveLink() {
    const currentPath = window.location.pathname;
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    
    sidebarItems.forEach(item => {
        const href = item.getAttribute('href');
        if (currentPath.endsWith(href) || (currentPath.endsWith('/') && href === 'dashboard.html')) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}
