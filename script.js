/* =========================================================
   Mobile Menu
   ========================================================= */

function toggleMobileMenu() {
    const navMenu = document.getElementById('navMenu');
    const hamburger = document.querySelector('.hamburger');

    if (!navMenu || !hamburger) return;

    navMenu.classList.toggle('active');
    hamburger.classList.toggle('active');

    document.body.style.overflow =
        navMenu.classList.contains('active') ? 'hidden' : '';
}

function closeMobileMenu() {
    const navMenu = document.getElementById('navMenu');
    const hamburger = document.querySelector('.hamburger');

    if (!navMenu || !hamburger) return;

    navMenu.classList.remove('active');
    hamburger.classList.remove('active');
    document.body.style.overflow = '';
}

// Close menu on outside click
document.addEventListener('click', (e) => {
    const navMenu = document.getElementById('navMenu');
    const navContainer = document.querySelector('.nav-container');

    if (!navMenu || !navContainer) return;

    if (navMenu.classList.contains('active') && !navContainer.contains(e.target)) {
        closeMobileMenu();
    }
});

// Close menu on resize
window.addEventListener('resize', () => {
    if (window.innerWidth > 991) {
        closeMobileMenu();
    }
});


/* =========================================================
   Modals (UI only)
   ========================================================= */

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

// Close modal when clicking overlay
window.addEventListener('click', (e) => {
    if (e.target.classList?.contains('modal')) {
        e.target.classList.remove('active');
    }
});


/* =========================================================
   Utilities
   ========================================================= */

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');

    const bg = {
        success: '#4ade80',
        error: '#f87171',
        warning: '#fbbf24',
        info: '#CFE8FF'
    };

    const color = {
        success: '#1C2333',
        error: '#ffffff',
        warning: '#1C2333',
        info: '#1C2333'
    };

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${bg[type] || bg.info};
        color: ${color[type] || color.info};
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,.3);
        z-index: 10000;
        font-weight: 600;
        animation: slideIn .3s ease;
        max-width: 400px;
    `;

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut .3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);

    if (!document.getElementById('notify-style')) {
        const style = document.createElement('style');
        style.id = 'notify-style';
        style.textContent = `
            @keyframes slideIn {
                from { opacity:0; transform:translateX(300px); }
                to { opacity:1; transform:translateX(0); }
            }
            @keyframes slideOut {
                from { opacity:1; transform:translateX(0); }
                to { opacity:0; transform:translateX(300px); }
            }
        `;
        document.head.appendChild(style);
    }
}


/* =========================================================
   Init (UI only)
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    // nothing related to auth or dashboard here
});
