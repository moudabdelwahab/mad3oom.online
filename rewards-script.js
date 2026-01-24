// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', function() {
    initializeRewardsSystem();
    loadUserWallet();
    setupEventListeners();
    displayHistory();
});

// ==================== Initialize System ====================
function initializeRewardsSystem() {
    // Check if user has a wallet, if not create one
    const userWallet = localStorage.getItem('userWallet');
    if (!userWallet) {
        const newWallet = {
            userId: generateUserId(),
            totalPoints: 0,
            availablePoints: 0,
            pendingPoints: 0,
            level: 'عضو جديد',
            createdAt: new Date().toLocaleString('ar-SA'),
            reports: [],
            history: []
        };
        localStorage.setItem('userWallet', JSON.stringify(newWallet));
    }
}

// ==================== Load User Wallet ====================
function loadUserWallet() {
    const wallet = JSON.parse(localStorage.getItem('userWallet') || '{}');
    
    // Update wallet display
    document.getElementById('totalPoints').textContent = wallet.totalPoints || 0;
    document.getElementById('availablePoints').textContent = wallet.availablePoints || 0;
    document.getElementById('pendingPoints').textContent = wallet.pendingPoints || 0;
    document.getElementById('memberLevel').textContent = wallet.level || 'عضو جديد';
    
    // Update progress bar
    updateLevelProgress(wallet.totalPoints || 0);
}

// ==================== Update Level Progress ====================
function updateLevelProgress(points) {
    const levels = [
        { name: 'عضو جديد', min: 0, max: 100 },
        { name: 'عضو نشط', min: 100, max: 250 },
        { name: 'عضو ذهبي', min: 250, max: 500 },
        { name: 'عضو بلاتيني', min: 500, max: 1000 },
        { name: 'سفير المنصة', min: 1000, max: Infinity }
    ];
    
    const currentLevel = levels.find(l => points >= l.min && points < l.max);
    const nextLevel = levels[levels.indexOf(currentLevel) + 1] || currentLevel;
    
    const progress = ((points - currentLevel.min) / (nextLevel.max - currentLevel.min)) * 100;
    document.getElementById('levelProgress').style.width = Math.min(progress, 100) + '%';
    document.getElementById('currentLevelPoints').textContent = points;
    document.getElementById('nextLevelPoints').textContent = nextLevel.max === Infinity ? '∞' : nextLevel.max;
}

// ==================== Setup Event Listeners ====================
function setupEventListeners() {
    const reportForm = document.getElementById('reportForm');
    if (reportForm) {
        reportForm.addEventListener('submit', submitReport);
    }
}

// ==================== Update Points Estimate ====================
function updatePointsEstimate() {
    const severity = document.getElementById('severity').value;
    const pointsMap = {
        'low': 10,
        'medium': 25,
        'high': 50,
        'critical': 100
    };
    
    const points = pointsMap[severity] || 0;
    document.getElementById('estimatedPoints').textContent = points;
}

// ==================== Submit Report ====================
function submitReport(event) {
    event.preventDefault();
    
    // Validate form
    const title = document.getElementById('title').value.trim();
    const description = document.getElementById('description').value.trim();
    const email = document.getElementById('email').value.trim();
    const problemType = document.getElementById('problemType').value;
    const severity = document.getElementById('severity').value;
    const notificationMethod = document.querySelector('input[name="notificationMethod"]:checked').value;
    
    if (!title || !description || !email || !problemType || !severity) {
        showNotification('يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
    }
    
    // Get estimated points
    const pointsMap = {
        'low': 10,
        'medium': 25,
        'high': 50,
        'critical': 100
    };
    const estimatedPoints = pointsMap[severity] || 0;
    
    // Create report object
    const report = {
        id: generateReportId(),
        title: title,
        description: description,
        email: email,
        phone: document.getElementById('phone').value.trim(),
        problemType: problemType,
        severity: severity,
        notificationMethod: notificationMethod,
        estimatedPoints: estimatedPoints,
        status: 'pending',
        submittedAt: new Date().toLocaleString('ar-SA'),
        approvedAt: null,
        actualPoints: 0
    };
    
    // Save report
    let wallet = JSON.parse(localStorage.getItem('userWallet') || '{}');
    wallet.pendingPoints = (wallet.pendingPoints || 0) + estimatedPoints;
    
    if (!wallet.reports) wallet.reports = [];
    wallet.reports.push(report);
    
    if (!wallet.history) wallet.history = [];
    wallet.history.push({
        type: 'report_submitted',
        report: report.id,
        points: estimatedPoints,
        status: 'pending',
        date: new Date().toLocaleString('ar-SA')
    });
    
    localStorage.setItem('userWallet', JSON.stringify(wallet));
    
    // Send notifications
    sendNotifications(report, notificationMethod);
    
    // Show success message
    showNotification('تم إرسال البلاغ بنجاح! سيتم مراجعته قريباً.', 'success');
    
    // Reset form
    document.getElementById('reportForm').reset();
    
    // Reload wallet
    loadUserWallet();
    displayHistory();
    
    // Log to console
    console.log('📋 تم تقديم بلاغ جديد:', report);
}

// ==================== Send Notifications ====================
function sendNotifications(report, method) {
    const emailContent = `
        تم استقبال بلاغك بنجاح!
        
        تفاصيل البلاغ:
        - العنوان: ${report.title}
        - النوع: ${report.problemType}
        - درجة الخطورة: ${report.severity}
        - النقاط المتوقعة: ${report.estimatedPoints}
        
        سيتم مراجعة البلاغ وإضافة النقاط إلى حسابك بعد الموافقة.
        
        معرف البلاغ: ${report.id}
    `;
    
    if (method === 'email' || method === 'both') {
        console.log(`📧 إرسال بريد إلى: ${report.email}`);
        console.log('محتوى البريد:', emailContent);
        showNotification(`تم إرسال تأكيد إلى: ${report.email}`, 'info');
    }
    
    if (method === 'telegram' || method === 'both') {
        console.log('📱 إرسال رسالة تليجرام');
        console.log('محتوى الرسالة:', emailContent);
        showNotification('تم إرسال إشعار عبر تليجرام', 'info');
    }
}

// ==================== Display History ====================
function displayHistory(filter = 'all') {
    const wallet = JSON.parse(localStorage.getItem('userWallet') || '{}');
    const history = wallet.history || [];
    const reports = wallet.reports || [];
    
    const historyList = document.getElementById('historyList');
    
    if (history.length === 0) {
        historyList.innerHTML = '<div class="empty-state"><p>لا توجد سجلات حتى الآن</p></div>';
        return;
    }
    
    let filteredHistory = history;
    if (filter === 'earned') {
        filteredHistory = history.filter(h => h.status === 'approved');
    } else if (filter === 'pending') {
        filteredHistory = history.filter(h => h.status === 'pending');
    } else if (filter === 'rejected') {
        filteredHistory = history.filter(h => h.status === 'rejected');
    }
    
    historyList.innerHTML = filteredHistory.map(item => {
        const report = reports.find(r => r.id === item.report);
        const statusClass = `status-${item.status}`;
        const statusText = {
            'approved': 'موافق عليه',
            'pending': 'قيد المراجعة',
            'rejected': 'مرفوض'
        }[item.status] || item.status;
        
        return `
            <div class="history-item">
                <div class="history-content">
                    <h4>${report?.title || 'بلاغ'}</h4>
                    <p>النوع: ${report?.problemType || 'غير محدد'}</p>
                    <p>درجة الخطورة: ${report?.severity || 'غير محددة'}</p>
                    <p class="history-date">${item.date}</p>
                </div>
                <div class="history-points">
                    <div class="history-points-value">${item.points}</div>
                    <div class="history-status ${statusClass}">${statusText}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== Filter History ====================
function filterHistory(filter, event) {
    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Display filtered history
    displayHistory(filter);
}

// ==================== Notification System ====================
// Using shared showNotification from script.js if available, otherwise define it
if (typeof showNotification === 'undefined') {
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        
        const colors = {
            success: '#4ade80',
            error: '#f87171',
            warning: '#fbbf24',
            info: '#CFE8FF',
            danger: '#f87171'
        };
        
        const textColors = {
            success: '#1C2333',
            error: '#ffffff',
            warning: '#1C2333',
            info: '#1C2333',
            danger: '#ffffff'
        };
        
        const color = colors[type] || colors.info;
        const textColor = textColors[type] || textColors.info;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: ${color};
            color: ${textColor};
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            animation: slideInNotification 0.3s ease;
            max-width: 400px;
            font-weight: 600;
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Add animation styles if not already added
        if (!document.querySelector('style[data-notification]')) {
            const style = document.createElement('style');
            style.setAttribute('data-notification', 'true');
            style.textContent = `
                @keyframes slideInNotification {
                    from {
                        opacity: 0;
                        transform: translateX(400px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                @keyframes slideOutNotification {
                    from {
                        opacity: 1;
                        transform: translateX(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateX(400px);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Remove notification after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutNotification 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// ==================== Utility Functions ====================
function generateUserId() {
    return 'USER_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function generateReportId() {
    return 'REPORT_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ==================== Admin Functions (For Testing) ====================
function approveReport(reportId, actualPoints) {
    let wallet = JSON.parse(localStorage.getItem('userWallet') || '{}');
    
    const reportIndex = wallet.reports.findIndex(r => r.id === reportId);
    if (reportIndex === -1) {
        console.log('البلاغ غير موجود');
        return;
    }
    
    const report = wallet.reports[reportIndex];
    const estimatedPoints = report.estimatedPoints;
    
    // Update report
    report.status = 'approved';
    report.actualPoints = actualPoints || estimatedPoints;
    report.approvedAt = new Date().toLocaleString('ar-SA');
    
    // Update wallet
    wallet.pendingPoints = Math.max(0, (wallet.pendingPoints || 0) - estimatedPoints);
    wallet.availablePoints = (wallet.availablePoints || 0) + (actualPoints || estimatedPoints);
    wallet.totalPoints = (wallet.totalPoints || 0) + (actualPoints || estimatedPoints);
    
    // Update level
    wallet.level = getLevelByPoints(wallet.totalPoints);
    
    // Add to history
    if (!wallet.history) wallet.history = [];
    wallet.history.push({
        type: 'report_approved',
        report: reportId,
        points: actualPoints || estimatedPoints,
        status: 'approved',
        date: new Date().toLocaleString('ar-SA')
    });
    
    localStorage.setItem('userWallet', JSON.stringify(wallet));
    
    console.log('✅ تم الموافقة على البلاغ:', reportId);
    console.log('النقاط المضافة:', actualPoints || estimatedPoints);
    
    loadUserWallet();
    displayHistory();
}

function rejectReport(reportId) {
    let wallet = JSON.parse(localStorage.getItem('userWallet') || '{}');
    
    const reportIndex = wallet.reports.findIndex(r => r.id === reportId);
    if (reportIndex === -1) {
        console.log('البلاغ غير موجود');
        return;
    }
    
    const report = wallet.reports[reportIndex];
    const estimatedPoints = report.estimatedPoints;
    
    // Update report
    report.status = 'rejected';
    report.approvedAt = new Date().toLocaleString('ar-SA');
    
    // Update wallet
    wallet.pendingPoints = Math.max(0, (wallet.pendingPoints || 0) - estimatedPoints);
    
    // Add to history
    if (!wallet.history) wallet.history = [];
    wallet.history.push({
        type: 'report_rejected',
        report: reportId,
        points: 0,
        status: 'rejected',
        date: new Date().toLocaleString('ar-SA')
    });
    
    localStorage.setItem('userWallet', JSON.stringify(wallet));
    
    console.log('❌ تم رفض البلاغ:', reportId);
    
    loadUserWallet();
    displayHistory();
}

function getLevelByPoints(points) {
    if (points >= 1000) return 'سفير المنصة';
    if (points >= 500) return 'عضو بلاتيني';
    if (points >= 250) return 'عضو ذهبي';
    if (points >= 100) return 'عضو نشط';
    return 'عضو جديد';
}

// ==================== View Wallet Data ====================
function viewWalletData() {
    const wallet = JSON.parse(localStorage.getItem('userWallet') || '{}');
    console.group('💰 بيانات المحفظة');
    console.log('معرف المستخدم:', wallet.userId);
    console.log('إجمالي النقاط:', wallet.totalPoints);
    console.log('النقاط المتاحة:', wallet.availablePoints);
    console.log('النقاط قيد المراجعة:', wallet.pendingPoints);
    console.log('المستوى:', wallet.level);
    console.log('عدد البلاغات:', wallet.reports?.length || 0);
    console.log('سجل النقاط:', wallet.history || []);
    console.groupEnd();
    return wallet;
}

// ==================== Console Helper ====================
console.log('%c💰 نظام المكافآت - منصة مدعوم', 'font-size: 20px; color: #3b82f6; font-weight: bold;');
console.log('%cالدوال المتاحة:', 'font-size: 14px; color: #06b6d4; font-weight: bold;');
console.log('viewWalletData() - عرض بيانات المحفظة');
console.log('approveReport(reportId, points) - الموافقة على بلاغ');
console.log('rejectReport(reportId) - رفض بلاغ');
console.log('filterHistory(filter) - تصفية السجل');
