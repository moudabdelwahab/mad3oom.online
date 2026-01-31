export function initCustomerSidebar(onTabChange) {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    fetch('/assets/components/customer-sidebar.html')
        .then(response => response.text())
        .then(html => {
            sidebarContainer.innerHTML = html;
            setupSidebarLogic(onTabChange);
        })
        .catch(err => console.error('Error loading customer sidebar:', err));
}

function setupSidebarLogic(onTabChange) {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const customerAvatarBtn = document.getElementById('customerAvatarBtn');
    const customerAvatarMenu = document.getElementById('customerAvatarMenu');
    const sidebarItems = document.querySelectorAll('.sidebar-item[data-tab]');

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

    // Tab switching logic
    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = item.getAttribute('data-tab');
            
            // Update active state in sidebar
            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // Trigger tab change in main logic
            if (onTabChange) onTabChange(tabName);
            
            // Close sidebar on mobile
            if (window.innerWidth <= 768) {
                toggleSidebar();
            }
        });
    });

    // Avatar Menu Logic
    if (customerAvatarBtn && customerAvatarMenu) {
        customerAvatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = customerAvatarMenu.style.display === 'block';
            customerAvatarMenu.style.display = isVisible ? 'none' : 'block';
        });

        document.addEventListener('click', () => {
            customerAvatarMenu.style.display = 'none';
        });
    }

    // Handle logout
    const customerSignOut = document.getElementById('customerSignOut');
    const sidebarSignOut = document.getElementById('sidebarSignOut');
    
    const onLogout = async (e) => {
        e.preventDefault();
        const { logout } = await import('../auth-client.js');
        await logout();
        window.location.replace('sign-in.html');
    };

    if (customerSignOut) customerSignOut.addEventListener('click', onLogout);
    if (sidebarSignOut) sidebarSignOut.addEventListener('click', onLogout);
}
