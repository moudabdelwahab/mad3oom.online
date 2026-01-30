// ==================== Subscriptions Page Script ====================

// Toggle billing period (monthly/yearly)
function toggleBilling(section) {
    const toggleBtn = document.querySelector(`#${section} .toggle-btn`);
    if (!toggleBtn) return;
    
    const options = toggleBtn.querySelectorAll('.toggle-option');
    options.forEach(opt => opt.classList.toggle('active'));
    
    // Update prices based on billing period
    updatePrices(section, options[1].classList.contains('active') ? 'yearly' : 'monthly');
}

function updatePrices(section, period) {
    // This function can be extended to update prices dynamically
    // For now, it's a placeholder for future implementation
    console.log(`Updating prices for ${section} to ${period}`);
}

// Scroll to section
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Contact sales function
function contactSales() {
    // This can be extended to open a contact form or redirect to contact page
    alert('يرجى التواصل معنا عبر البريد الإلكتروني: support@mad3oom.online');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Add smooth scroll behavior for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
    
    // Initialize toggle buttons
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const section = this.closest('.pricing-section')?.id || 'individuals';
            toggleBilling(section);
        });
    });
});

