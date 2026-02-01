// Tab Switching Functionality
function switchTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active class from all buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    // Add active class to clicked button
    event.target.classList.add('active');

    // Initialize chart if details tab is opened
    if (tabName === 'details') {
        setTimeout(() => {
            initializeChart();
        }, 100);
    }
}

// Chart Initialization
function initializeChart() {
    const canvas = document.getElementById('changesChart');
    if (!canvas || canvas.dataset.initialized) return;

    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = 300;

    // Chart data
    const data = {
        labels: ['api-management.html', 'api-docs.html'],
        datasets: [
            {
                label: 'عدد التعديلات',
                data: [5, 2],
                backgroundColor: ['#0077CC', '#0055AA'],
                borderColor: ['#003366', '#003366'],
                borderWidth: 2,
                borderRadius: 8,
            }
        ]
    };

    // Draw bar chart manually
    drawBarChart(ctx, data, canvas.width, canvas.height);
    canvas.dataset.initialized = 'true';
}

// Manual Bar Chart Drawing
function drawBarChart(ctx, data, width, height) {
    const padding = 50;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const barWidth = chartWidth / (data.labels.length * 1.5);
    const maxValue = Math.max(...data.datasets[0].data);

    // Draw background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }

    // Draw Y-axis labels
    ctx.fillStyle = '#666666';
    ctx.font = '12px Cairo';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const value = Math.round((maxValue / 5) * i);
        const y = padding + (chartHeight / 5) * (5 - i);
        ctx.fillText(value, padding - 10, y + 4);
    }

    // Draw axes
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw bars
    data.labels.forEach((label, index) => {
        const value = data.datasets[0].data[index];
        const barHeight = (value / maxValue) * chartHeight;
        const x = padding + (index * (chartWidth / data.labels.length)) + (chartWidth / data.labels.length - barWidth) / 2;
        const y = height - padding - barHeight;

        // Draw bar
        ctx.fillStyle = data.datasets[0].backgroundColor[index];
        ctx.fillRect(x, y, barWidth, barHeight);

        // Draw border
        ctx.strokeStyle = data.datasets[0].borderColor[index];
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, barWidth, barHeight);

        // Draw value on top of bar
        ctx.fillStyle = '#003366';
        ctx.font = 'bold 14px Cairo';
        ctx.textAlign = 'center';
        ctx.fillText(value, x + barWidth / 2, y - 10);

        // Draw label
        ctx.fillStyle = '#666666';
        ctx.font = '12px Cairo';
        ctx.textAlign = 'center';
        const labelX = x + barWidth / 2;
        const labelY = height - padding + 20;
        ctx.fillText(label, labelX, labelY);
    });

    // Draw legend
    ctx.fillStyle = '#003366';
    ctx.font = 'bold 12px Cairo';
    ctx.textAlign = 'right';
    ctx.fillText(data.datasets[0].label, width - padding, padding - 10);
}

// Smooth scroll for navigation
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add animation on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'slideInUp 0.5s ease forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe all cards
document.querySelectorAll('.fix-card, .stat-card, .technical-section, .benefit-card').forEach(card => {
    observer.observe(card);
});

// Handle window resize for chart
window.addEventListener('resize', () => {
    const canvas = document.getElementById('changesChart');
    if (canvas) {
        canvas.dataset.initialized = '';
        initializeChart();
    }
});

// Add ripple effect to buttons
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple');

        this.appendChild(ripple);

        setTimeout(() => ripple.remove(), 600);
    });
});

// Add CSS for ripple effect dynamically
const style = document.createElement('style');
style.textContent = `
    .tab-btn {
        position: relative;
        overflow: hidden;
    }

    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(0, 119, 204, 0.5);
        transform: scale(0);
        animation: ripple-animation 0.6s ease-out;
        pointer-events: none;
    }

    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('تقرير إصلاح مشاكل منصة مدعوم - تم التحميل بنجاح');
    
    // Add smooth animations
    const cards = document.querySelectorAll('.fix-card, .stat-card');
    cards.forEach((card, index) => {
        card.style.animationDelay = (index * 0.1) + 's';
    });
});

// Export report functionality
function exportReport() {
    const reportContent = document.body.innerText;
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(reportContent));
    element.setAttribute('download', 'fixes-report-' + new Date().toISOString().split('T')[0] + '.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

// Print functionality
function printReport() {
    window.print();
}

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + P for print
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        printReport();
    }
});
