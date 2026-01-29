/**
 * Admin Dashboard Enhanced - JavaScript Module
 * إدارة لوحة التحكم الإدارية المتقدمة
 */

class AdminDashboard {
    constructor() {
        this.currentPage = 'dashboard';
        this.currentTab = 'pending';
        this.charts = {};
        this.init();
    }

    init() {
        this.renderSidebarMenu();
        this.renderNavIcons();
        this.setupEventListeners();
        this.loadDashboardData();
        this.initializeCharts();
    }

    // ==================== Render Sidebar Menu ====================
    renderSidebarMenu() {
        const sidebarMenu = document.getElementById('sidebarMenu');
        const menuItems = [
            { id: 'dashboard', icon: 'dashboard', label: 'لوحة المعلومات' },
            { id: 'users', icon: 'users', label: 'إدارة المستخدمين' },
            { id: 'reports', icon: 'reports', label: 'البلاغات والمكافآت' },
            { id: 'analytics', icon: 'analytics', label: 'التحليلات والتقارير' },
            { id: 'content', icon: 'content', label: 'إدارة المحتوى' },
            { id: 'settings', icon: 'settings', label: 'الإعدادات' }
        ];

        sidebarMenu.innerHTML = menuItems.map((item, index) => `
            <li class="sidebar-item">
                <a href="#${item.id}" class="sidebar-link ${index === 0 ? 'active' : ''}" data-page="${item.id}">
                    <div style="width: 20px; height: 20px;">${AdminIcons[item.icon]}</div>
                    <span>${item.label}</span>
                </a>
            </li>
        `).join('');
    }

    // ==================== Render Navigation Icons ====================
    renderNavIcons() {
        const notificationBtn = document.getElementById('notificationBtn');
        const themeToggle = document.getElementById('themeToggle');
        const refreshBtn = document.getElementById('refreshBtn');
        const exportBtn = document.getElementById('exportBtn');

        if (notificationBtn) {
            notificationBtn.innerHTML = `<div style="width: 20px; height: 20px;">${AdminIcons.bell}</div>`;
        }
        if (themeToggle) {
            themeToggle.innerHTML = `<div style="width: 20px; height: 20px;">${AdminIcons.sun}</div>`;
        }
        if (refreshBtn) {
            refreshBtn.innerHTML = `<div style="width: 16px; height: 16px; margin-right: 0.5rem;">${AdminIcons.refresh}</div>تحديث`;
        }
        if (exportBtn) {
            exportBtn.innerHTML = `<div style="width: 16px; height: 16px; margin-right: 0.5rem;">${AdminIcons.download}</div>تصدير`;
        }
    }

    setupEventListeners() {
        // Sidebar navigation - wait for sidebar to be rendered
        setTimeout(() => {
            document.querySelectorAll('.sidebar-link').forEach(link => {
                link.addEventListener('click', (e) => this.handlePageNavigation(e, link));
            });
        }, 100);

        // Tab navigation - wait for tabs to be rendered
        setTimeout(() => {
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.handleTabNavigation(e, btn));
            });
        }, 100);

        // Action buttons
        document.getElementById('refreshBtn')?.addEventListener('click', () => this.refreshData());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportData());
        document.getElementById('addUserBtn')?.addEventListener('click', () => this.openAddUserModal());
        document.getElementById('userProfileBtn')?.addEventListener('click', () => this.toggleUserMenu());
        document.getElementById('notificationBtn')?.addEventListener('click', () => this.toggleNotifications());

        // Search and filter
        document.getElementById('usersSearch')?.addEventListener('input', (e) => this.searchUsers(e.target.value));
        document.getElementById('usersFilter')?.addEventListener('change', (e) => this.filterUsers(e.target.value));
        document.getElementById('reportsSearch')?.addEventListener('input', (e) => this.searchReports(e.target.value));
    }

    // ==================== Page Navigation ====================
    handlePageNavigation(e, link) {
        e.preventDefault();
        const page = link.getAttribute('data-page');
        
        // Update active link
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        // Update active page
        document.querySelectorAll('.page-content').forEach(p => p.style.display = 'none');
        document.getElementById(`${page}-page`).style.display = 'block';
        
        this.currentPage = page;
        
        // Load page-specific data
        this.loadPageData(page);
    }

    loadPageData(page) {
        switch(page) {
            case 'dashboard':
                this.loadDashboardData();
                break;
            case 'users':
                this.loadUsersData();
                break;
            case 'reports':
                this.loadReportsData();
                break;
            case 'analytics':
                this.loadAnalyticsData();
                break;
            case 'content':
                this.loadContentData();
                break;
            case 'settings':
                this.loadSettingsData();
                break;
        }
    }

    // ==================== Dashboard ====================
    async loadDashboardData() {
        try {
            // Mock data - في التطبيق الحقيقي ستأتي من API
            const stats = {
                totalUsers: 1245,
                approvedReports: 856,
                pendingReports: 42,
                proUsers: 312,
                usersChange: 12.5,
                reportsChange: 8.3,
                pendingChange: -5.2,
                proChange: 15.7
            };

            this.updateStats(stats);
            this.loadActivityFeed();
        } catch (error) {
            console.error('خطأ في تحميل بيانات لوحة المعلومات:', error);
            this.showNotification('حدث خطأ في تحميل البيانات', 'error');
        }
    }

    updateStats(stats) {
        document.getElementById('totalUsers').textContent = stats.totalUsers.toLocaleString('ar-EG');
        document.getElementById('approvedReports').textContent = stats.approvedReports.toLocaleString('ar-EG');
        document.getElementById('pendingReports').textContent = stats.pendingReports.toLocaleString('ar-EG');
        document.getElementById('proUsers').textContent = stats.proUsers.toLocaleString('ar-EG');
        
        this.updateChangeIndicators(stats);
    }

    updateChangeIndicators(stats) {
        document.getElementById('usersChange').textContent = `${stats.usersChange}%`;
        document.getElementById('reportsChange').textContent = `${stats.reportsChange}%`;
        document.getElementById('pendingChange').textContent = `${stats.pendingChange}%`;
        document.getElementById('proChange').textContent = `${stats.proChange}%`;
    }

    loadActivityFeed() {
        // Mock activity data
        const activities = [
            {
                user: 'أحمد محمد',
                action: 'تقديم بلاغ جديد',
                type: 'بلاغ',
                time: 'منذ 5 دقائق',
                status: 'معلق'
            },
            {
                user: 'فاطمة علي',
                action: 'ترقية إلى مستخدم مميز',
                type: 'ترقية',
                time: 'منذ 30 دقيقة',
                status: 'مكتمل'
            },
            {
                user: 'محمد سالم',
                action: 'استرجاع كلمة المرور',
                type: 'أمان',
                time: 'منذ ساعة',
                status: 'مكتمل'
            }
        ];

        const tbody = document.getElementById('activityBody');
        tbody.innerHTML = activities.map(activity => `
            <tr>
                <td><strong>${activity.user}</strong></td>
                <td>${activity.action}</td>
                <td><span class="badge badge-info">${activity.type}</span></td>
                <td>${activity.time}</td>
                <td><span class="badge badge-${activity.status === 'مكتمل' ? 'success' : 'warning'}">${activity.status}</span></td>
            </tr>
        `).join('');
    }

    // ==================== Users Management ====================
    async loadUsersData() {
        try {
            // Mock users data
            const users = [
                {
                    id: 1,
                    name: 'أحمد محمد',
                    email: 'ahmed@example.com',
                    type: 'مميز',
                    points: 1250,
                    joinDate: '2024-01-15'
                },
                {
                    id: 2,
                    name: 'فاطمة علي',
                    email: 'fatima@example.com',
                    type: 'عادي',
                    points: 450,
                    joinDate: '2024-02-20'
                },
                {
                    id: 3,
                    name: 'محمد سالم',
                    email: 'salem@example.com',
                    type: 'مميز',
                    points: 2100,
                    joinDate: '2024-01-10'
                }
            ];

            this.renderUsersTable(users);
        } catch (error) {
            console.error('خطأ في تحميل بيانات المستخدمين:', error);
        }
    }

    renderUsersTable(users) {
        const tbody = document.getElementById('usersBody');
        tbody.innerHTML = users.map(user => `
            <tr>
                <td><strong>${user.name}</strong></td>
                <td>${user.email}</td>
                <td><span class="badge badge-${user.type === 'مميز' ? 'success' : 'info'}">${user.type}</span></td>
                <td><strong>${user.points.toLocaleString('ar-EG')}</strong></td>
                <td>${new Date(user.joinDate).toLocaleDateString('ar-EG')}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="adminDash.editUser(${user.id})" title="تعديل" style="width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center;"><div style="width: 16px; height: 16px;">${AdminIcons.edit}</div></button>
                    <button class="btn btn-sm btn-danger" onclick="adminDash.deleteUser(${user.id})" title="حذف" style="width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center;"><div style="width: 16px; height: 16px;">${AdminIcons.trash}</div></button>
                </td>
            </tr>
        `).join('');
    }

    searchUsers(query) {
        // Implement search logic
        console.log('البحث عن مستخدم:', query);
    }

    filterUsers(filter) {
        // Implement filter logic
        console.log('فلترة المستخدمين:', filter);
    }

    editUser(userId) {
        this.showNotification(`تحرير المستخدم ${userId}`, 'info');
    }

    deleteUser(userId) {
        if (confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
            this.showNotification('تم حذف المستخدم بنجاح', 'success');
        }
    }

    openAddUserModal() {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">إضافة مستخدم جديد</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <form onsubmit="adminDash.handleAddUser(event)">
                    <div class="form-group">
                        <label class="form-label">الاسم الكامل</label>
                        <input type="text" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">البريد الإلكتروني</label>
                        <input type="email" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">كلمة المرور</label>
                        <input type="password" class="form-control" required>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="this.closest('.modal').remove()">إلغاء</button>
                        <button type="submit" class="btn btn-primary" style="flex: 1;">إضافة</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }

    handleAddUser(event) {
        event.preventDefault();
        this.showNotification('تم إضافة المستخدم بنجاح', 'success');
        event.target.closest('.modal').remove();
        this.loadUsersData();
    }

    // ==================== Reports Management ====================
    async loadReportsData() {
        try {
            // Mock reports data
            const reports = [
                {
                    id: 1,
                    user: 'أحمد محمد',
                    title: 'مشكلة في الواجهة',
                    type: 'bug',
                    severity: 'high',
                    points: 100,
                    date: '2024-01-15',
                    status: 'pending'
                },
                {
                    id: 2,
                    user: 'فاطمة علي',
                    title: 'اقتراح ميزة جديدة',
                    type: 'feature',
                    severity: 'low',
                    points: 50,
                    date: '2024-01-14',
                    status: 'approved'
                }
            ];

            this.renderReportsTable(reports);
        } catch (error) {
            console.error('خطأ في تحميل البلاغات:', error);
        }
    }

    renderReportsTable(reports) {
        const tbody = document.getElementById('reportsBody');
        tbody.innerHTML = reports.map(report => `
            <tr>
                <td><strong>${report.user}</strong></td>
                <td>${report.title}</td>
                <td><span class="badge badge-info">${report.type}</span></td>
                <td><span class="badge badge-${this.getSeverityClass(report.severity)}">${report.severity}</span></td>
                <td><strong>${report.points}</strong></td>
                <td>${new Date(report.date).toLocaleDateString('ar-EG')}</td>
                <td>
                    ${report.status === 'pending' ? `
                        <button class="btn btn-sm btn-success" onclick="adminDash.approveReport(${report.id})" title="موافقة" style="width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center;"><div style="width: 16px; height: 16px;">${AdminIcons.check}</div></button>
                        <button class="btn btn-sm btn-danger" onclick="adminDash.rejectReport(${report.id})" title="رفض" style="width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center;"><div style="width: 16px; height: 16px;">${AdminIcons.close}</div></button>
                    ` : ''}
                    <button class="btn btn-sm btn-secondary" onclick="adminDash.viewReport(${report.id})" title="عرض" style="width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center;"><div style="width: 16px; height: 16px;">${AdminIcons.eye}</div></button>
                </td>
            </tr>
        `).join('');
    }

    getSeverityClass(severity) {
        const classes = {
            'low': 'success',
            'medium': 'warning',
            'high': 'danger',
            'critical': 'danger'
        };
        return classes[severity] || 'info';
    }

    searchReports(query) {
        console.log('البحث عن بلاغ:', query);
    }

    approveReport(reportId) {
        this.showNotification('تم الموافقة على البلاغ بنجاح', 'success');
    }

    rejectReport(reportId) {
        this.showNotification('تم رفض البلاغ بنجاح', 'success');
    }

    viewReport(reportId) {
        this.showNotification(`عرض تفاصيل البلاغ ${reportId}`, 'info');
    }

    // ==================== Analytics ====================
    async loadAnalyticsData() {
        try {
            this.initializeAnalyticsCharts();
        } catch (error) {
            console.error('خطأ في تحميل التحليلات:', error);
        }
    }

    initializeAnalyticsCharts() {
        // Growth Chart
        const growthCtx = document.getElementById('growthChart');
        if (growthCtx && !this.charts.growth) {
            this.charts.growth = new Chart(growthCtx, {
                type: 'bar',
                data: {
                    labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'],
                    datasets: [{
                        label: 'المستخدمون الجدد',
                        data: [65, 78, 90, 110, 125, 140],
                        backgroundColor: '#0077CC',
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        // Revenue Chart
        const revenueCtx = document.getElementById('revenueChart');
        if (revenueCtx && !this.charts.revenue) {
            this.charts.revenue = new Chart(revenueCtx, {
                type: 'line',
                data: {
                    labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'],
                    datasets: [{
                        label: 'الإيرادات',
                        data: [1200, 1900, 3000, 2500, 3500, 4000],
                        borderColor: '#2E8A3A',
                        backgroundColor: 'rgba(46, 138, 58, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }
    }

    // ==================== Content Management ====================
    async loadContentData() {
        // Load content management data
        console.log('تحميل بيانات إدارة المحتوى');
    }

    // ==================== Settings ====================
    async loadSettingsData() {
        // Load settings data
        console.log('تحميل الإعدادات');
    }

    // ==================== Tab Navigation ====================
    handleTabNavigation(e, btn) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTab = btn.getAttribute('data-tab');
        this.loadReportsData();
    }

    // ==================== Utility Functions ====================
    initializeCharts() {
        const usersCtx = document.getElementById('usersChart');
        if (usersCtx && !this.charts.users) {
            this.charts.users = new Chart(usersCtx, {
                type: 'line',
                data: {
                    labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'],
                    datasets: [{
                        label: 'المستخدمون الجدد',
                        data: [65, 78, 90, 110, 125, 140],
                        borderColor: '#0077CC',
                        backgroundColor: 'rgba(0, 119, 204, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 5,
                        pointBackgroundColor: '#0077CC'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        const reportsCtx = document.getElementById('reportsChart');
        if (reportsCtx && !this.charts.reports) {
            this.charts.reports = new Chart(reportsCtx, {
                type: 'doughnut',
                data: {
                    labels: ['موافق عليها', 'معلقة', 'مرفوضة'],
                    datasets: [{
                        data: [65, 25, 10],
                        backgroundColor: ['#2E8A3A', '#E0A800', '#D9534F'],
                        borderColor: '#FFFFFF',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }
    }

    refreshData() {
        this.showNotification('جاري تحديث البيانات...', 'info');
        this.loadPageData(this.currentPage);
    }

    exportData() {
        this.showNotification('جاري تصدير البيانات...', 'info');
        // Implement export functionality
    }

    toggleUserMenu() {
        console.log('تبديل قائمة المستخدم');
    }

    toggleNotifications() {
        console.log('تبديل الإشعارات');
    }

    showNotification(message, type = 'info') {
        // Create a simple notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: ${type === 'success' ? '#2E8A3A' : type === 'error' ? '#D9534F' : '#0077CC'};
            color: white;
            border-radius: 0.5rem;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            z-index: 9999;
            animation: slideIn 0.3s ease-out;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => notification.remove(), 3000);
    }
}

// Initialize dashboard when DOM is ready
let adminDash;
document.addEventListener('DOMContentLoaded', () => {
    adminDash = new AdminDashboard();
});
