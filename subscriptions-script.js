// ==================== Subscriptions Page Script ====================

// Toggle billing period (monthly/yearly)
function toggleBilling() {
    const toggleBtn = document.getElementById('billingToggle');
    if (!toggleBtn) return;
    
    const options = toggleBtn.querySelectorAll('.toggle-option');
    const isYearly = !options[1].classList.contains('active');
    
    options.forEach(opt => opt.classList.toggle('active'));
    
    // Update prices based on billing period
    updatePrices(isYearly ? 'yearly' : 'monthly');
}

function updatePrices(period) {
    const premiumAmount = document.getElementById('premiumAmount');
    const premiumPeriod = document.getElementById('premiumPeriod');
    const premiumOldPrice = document.getElementById('premiumOldPrice');
    const premiumDiscount = document.getElementById('premiumDiscount');
    const limitedTimeOffer = document.getElementById('limitedTimeOffer');

    if (period === 'yearly') {
        // السعر السنوي 1500 جنيه (بدلاً من 3000)
        premiumAmount.textContent = '1500';
        premiumPeriod.textContent = '/سنوياً';
        premiumOldPrice.style.display = 'inline';
        premiumDiscount.style.display = 'inline';
        limitedTimeOffer.style.display = 'block';
    } else {
        // السعر الشهري 250 جنيه
        premiumAmount.textContent = '250';
        premiumPeriod.textContent = '/شهرياً';
        premiumOldPrice.style.display = 'none';
        premiumDiscount.style.display = 'none';
        limitedTimeOffer.style.display = 'none';
    }
    
    console.log(`Updating prices to ${period}`);
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
    const toggleBtn = document.getElementById('billingToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            toggleBilling();
        });
    }

    // Initialize subscribe button
    const subscribeBtn = document.getElementById('subscribeBtn');
    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', function() {
            const options = document.querySelectorAll('#billingToggle .toggle-option');
            const isYearly = options[1].classList.contains('active');
            const amount = isYearly ? '1500' : '250';
            const period = isYearly ? 'yearly' : 'monthly';
            
            window.location.href = `payment.html?plan=premium&period=${period}&amount=${amount}`;
        });
    }
});
