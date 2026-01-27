// admin-rewards.js - إدارة المكافآت والبلاغات من قبل المسؤول
import { 
    getPendingReports, 
    approveReport, 
    rejectReport, 
    getRewardsStats, 
    searchReports 
} from './rewards-service.js';

export async function initAdminRewards() {
    // تحميل الإحصائيات والبلاغات بشكل متوازي لسرعة الاستجابة
    await Promise.all([
        loadRewardsStats(),
        loadPendingReports()
    ]);

    // ربط البحث والفلاتر
    bindSearchAndFilters();
}

// ==================== تحميل الإحصائيات ====================
async function loadRewardsStats() {
    try {
        const stats = await getRewardsStats();

        document.getElementById('admPendingReports').textContent = stats.pendingReports;
        document.getElementById('admApprovedReports').textContent = stats.approvedReports;
        document.getElementById('admRejectedReports').textContent = stats.rejectedReports;
        document.getElementById('admProUsers').textContent = stats.proUsers;

    } catch (error) {
        console.error('خطأ في تحميل الإحصائيات:', error);
    }
}

// ==================== تحميل البلاغات المعلقة ====================
async function loadPendingReports() {
    try {
        const reports = await getPendingReports();
        const tbody = document.getElementById('reportsTableBody');

        if (reports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">لا توجد بلاغات معلقة</td></tr>';
            return;
        }

        renderReportsToTable(reports);

    } catch (error) {
        console.error('خطأ في تحميل البلاغات:', error);
    }
}

// ==================== رندر البلاغات في الجدول ====================
function renderReportsToTable(reports) {
    const tbody = document.getElementById('reportsTableBody');
    tbody.innerHTML = reports.map(report => {
        const createdDate = new Date(report.created_at).toLocaleDateString('ar-EG');
        const userName = report.profiles?.full_name || report.profiles?.email?.split('@')[0] || 'مستخدم';
        const userEmail = report.profiles?.email || '-';

        return `
            <tr>
                <td>
                    <div style="font-weight: 600;">${userName}</div>
                    <div style="font-size: 0.85rem; color: var(--color-text-secondary);">${userEmail}</div>
                </td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${report.title}</td>
                <td><span style="padding: 0.25rem 0.75rem; background: var(--color-muted); border-radius: 0.25rem; font-size: 0.85rem;">${report.problem_type}</span></td>
                <td><span style="padding: 0.25rem 0.75rem; background: ${getSeverityColor(report.severity)}; border-radius: 0.25rem; font-size: 0.85rem; color: white;">${report.severity}</span></td>
                <td><span class="status-badge status-${report.status}">${getStatusText(report.status)}</span></td>
                <td style="font-weight: 600; color: var(--color-accent);">${report.actual_points || report.estimated_points}</td>
                <td style="font-size: 0.85rem; color: var(--color-text-secondary);">${createdDate}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        ${report.status === 'pending' ? `
                            <button class="btn btn-sm" style="background: var(--color-success); color: white; border: none; cursor: pointer;" onclick="openApproveModal('${report.id}', ${report.estimated_points})">موافقة</button>
                            <button class="btn btn-sm" style="background: var(--color-danger); color: white; border: none; cursor: pointer;" onclick="openRejectModal('${report.id}')">رفض</button>
                        ` : ''}
                        <button class="btn btn-sm" style="background: var(--color-accent); color: white; border: none; cursor: pointer;" onclick="viewReportDetails('${report.id}')">عرض</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==================== ربط البحث والفلاتر ====================
function bindSearchAndFilters() {
    const searchInput = document.getElementById('reportsSearch');
    const statusFilter = document.getElementById('reportsStatusFilter');

    if (searchInput) {
        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value;
            if (query.length < 2) {
                await loadPendingReports();
                return;
            }

            try {
                const results = await searchReports(query);
                renderReportsToTable(results);
            } catch (error) {
                console.error('خطأ في البحث:', error);
            }
        });
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', async (e) => {
            const status = e.target.value;
            try {
                let results;
                if (status === 'all') {
                    results = await getPendingReports();
                } else {
                    results = await searchReports('', status);
                }
                renderReportsToTable(results);
            } catch (error) {
                console.error('خطأ في الفلترة:', error);
            }
        });
    }
}

// ==================== دوال مساعدة ====================
function getSeverityColor(severity) {
    const colors = {
        'low': '#10b981',
        'medium': '#f59e0b',
        'high': '#ef4444',
        'critical': '#7c2d12'
    };
    return colors[severity] || '#6b7280';
}

function getStatusText(status) {
    const texts = {
        'pending': 'معلقة',
        'approved': 'موافق عليها',
        'rejected': 'مرفوضة'
    };
    return texts[status] || status;
}

// ==================== فتح مودال الموافقة ====================
window.openApproveModal = function(reportId, estimatedPoints) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'approveReportModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.5); z-index: 1000; display: flex; 
        align-items: center; justify-content: center;
    `;

    modal.innerHTML = `
        <div class="modal-content" style="background: var(--color-surface); padding: 2rem; border-radius: 1rem; width: 90%; max-width: 500px;">
            <h2>الموافقة على البلاغ</h2>
            <form id="approveForm" style="margin-top: 1.5rem;">
                <div class="form-group">
                    <label>النقاط المتوقعة: <strong>${estimatedPoints}</strong></label>
                </div>
                <div class="form-group">
                    <label>النقاط الفعلية (يمكنك تعديلها)</label>
                    <input type="number" id="actualPoints" class="form-control" value="${estimatedPoints}" min="0" required>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="document.getElementById('approveReportModal').remove()">إلغاء</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">الموافقة</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('approveForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const actualPoints = parseInt(document.getElementById('actualPoints').value);

        try {
            await approveReport(reportId, actualPoints);
            modal.remove();
            await loadRewardsStats();
            await loadPendingReports();
            showNotification('تم الموافقة على البلاغ بنجاح!', 'success');
        } catch (error) {
            console.error('خطأ في الموافقة:', error);
            showNotification('حدث خطأ في الموافقة على البلاغ', 'error');
        }
    });
};

// ==================== فتح مودال الرفض ====================
window.openRejectModal = function(reportId) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'rejectReportModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.5); z-index: 1000; display: flex; 
        align-items: center; justify-content: center;
    `;

    modal.innerHTML = `
        <div class="modal-content" style="background: var(--color-surface); padding: 2rem; border-radius: 1rem; width: 90%; max-width: 500px;">
            <h2>رفض البلاغ</h2>
            <form id="rejectForm" style="margin-top: 1.5rem;">
                <div class="form-group">
                    <label>سبب الرفض</label>
                    <textarea id="rejectionReason" class="form-control" style="min-height: 100px;" placeholder="اشرح سبب رفض البلاغ..." required></textarea>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="document.getElementById('rejectReportModal').remove()">إلغاء</button>
                    <button type="submit" class="btn btn-danger" style="flex: 1; background: var(--color-danger);">رفض</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('rejectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const reason = document.getElementById('rejectionReason').value;

        try {
            await rejectReport(reportId, reason);
            modal.remove();
            await loadRewardsStats();
            await loadPendingReports();
            showNotification('تم رفض البلاغ بنجاح!', 'success');
        } catch (error) {
            console.error('خطأ في الرفض:', error);
            showNotification('حدث خطأ في رفض البلاغ', 'error');
        }
    });
};

// ==================== عرض تفاصيل البلاغ ====================
window.viewReportDetails = async function(reportId) {
    try {
        // جلب البلاغ من البحث (أو يمكن جلب بياناته من Supabase مباشرة)
        const results = await searchReports('');
        const report = results.find(r => r.id === reportId);
        
        if (!report) return;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'viewReportModal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.5); z-index: 1000; display: flex; 
            align-items: center; justify-content: center;
        `;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--color-surface); padding: 2rem; border-radius: 1rem; width: 90%; max-width: 600px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h2 style="margin: 0;">تفاصيل البلاغ</h2>
                    <button onclick="document.getElementById('viewReportModal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--color-text);">&times;</button>
                </div>
                <div style="display: grid; gap: 1rem;">
                    <div><strong>العنوان:</strong> ${report.title}</div>
                    <div><strong>النوع:</strong> ${report.problem_type}</div>
                    <div><strong>درجة الخطورة:</strong> ${report.severity}</div>
                    <div><strong>الحالة:</strong> ${getStatusText(report.status)}</div>
                    <div><strong>الوصف:</strong><div style="background: var(--color-muted); padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; white-space: pre-wrap;">${report.description}</div></div>
                    ${report.rejection_reason ? `<div><strong>سبب الرفض:</strong> <span style="color: var(--color-danger);">${report.rejection_reason}</span></div>` : ''}
                </div>
                <div style="margin-top: 2rem; text-align: left;">
                    <button class="btn btn-secondary" onclick="document.getElementById('viewReportModal').remove()">إغلاق</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    } catch (error) {
        console.error('خطأ في عرض التفاصيل:', error);
    }
};

// ==================== دالة الإشعار ====================
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    
    const colors = {
        success: '#4ade80',
        error: '#f87171',
        warning: '#fbbf24',
        info: '#CFE8FF'
    };
    
    const textColors = {
        success: '#1C2333',
        error: '#ffffff',
        warning: '#1C2333',
        info: '#1C2333'
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
    
    setTimeout(() => {
        notification.style.animation = 'slideOutNotification 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

export default {
    initAdminRewards,
    loadRewardsStats,
    loadPendingReports,
    bindSearchAndFilters
};
