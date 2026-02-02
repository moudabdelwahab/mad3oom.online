// rewards-dashboard.js - إدارة تبويب المكافآت في لوحة العميل
import { 
    getUserWallet, 
    submitReport, 
    getUserReports, 
    calculateMembershipLevel, 
    getProProgressInfo,
    SEVERITY_POINTS 
} from './rewards-service.js';

export async function initRewardsDashboard(user) {
    if (!user || !user.id) return;

    // تحميل بيانات المحفظة
    await loadWalletData(user.id);

    // تحميل البلاغات
    await loadUserReports(user.id);

    // ربط نموذج البلاغ الجديد
    bindReportForm(user.id);

    // تحديث النقاط عند التغيير
    subscribeToWalletUpdates(user.id);
}

// ==================== تحميل بيانات المحفظة ====================
async function loadWalletData(userId) {
    try {
        const wallet = await getUserWallet(userId);
        
        // حساب مستوى العضوية الحالي بناءً على النقاط الكلية لضمان التزامن
        const currentLevel = calculateMembershipLevel(wallet.total_points || 0);

        // تحديث العناصر في تبويب المكافآت
        if (document.getElementById('rewardsTotalPoints')) {
            document.getElementById('rewardsTotalPoints').textContent = wallet.total_points || 0;
        }
        if (document.getElementById('rewardsAvailablePoints')) {
            document.getElementById('rewardsAvailablePoints').textContent = wallet.available_points || 0;
        }
        if (document.getElementById('rewardsPendingPoints')) {
            document.getElementById('rewardsPendingPoints').textContent = wallet.pending_points || 0;
        }
        if (document.getElementById('rewardsMemberLevel')) {
            document.getElementById('rewardsMemberLevel').textContent = currentLevel;
        }

        // تحديث الرصيد في شريط التنقل (Navbar) لضمان التزامن
        if (document.getElementById('pointsCount')) {
            document.getElementById('pointsCount').textContent = wallet.total_points || 0;
        }
        if (document.getElementById('pointsTooltip')) {
            document.getElementById('pointsTooltip').textContent = (wallet.total_points || 0) + ' نقطة';
        }

        // تحديث معلومات Pro
        updateProBadgeInfo(wallet);

        // تحديث شريط التقدم (يشمل النقاط الكلية + المعلقة لبيان التقدم)
        updateProProgressBar(wallet.total_points + (wallet.pending_points || 0));

    } catch (error) {
        console.error('خطأ في تحميل بيانات المحفظة:', error);
    }
}

// ==================== تحديث معلومات شارة Pro ====================
function updateProBadgeInfo(wallet) {
    const proBadgeInfo = document.getElementById('proBadgeInfo');
    if (!proBadgeInfo) return;
    
    if (wallet.is_pro || (wallet.total_points >= 1000)) {
        proBadgeInfo.style.display = 'flex';
    } else {
        proBadgeInfo.style.display = 'none';
    }
}

// ==================== تحديث شريط التقدم نحو Pro ====================
function updateProProgressBar(totalPoints) {
    const proInfo = getProProgressInfo(totalPoints);
    
    if (document.getElementById('currentProPoints')) {
        document.getElementById('currentProPoints').textContent = proInfo.currentPoints;
    }
    if (document.getElementById('proProgressBar')) {
        document.getElementById('proProgressBar').style.width = proInfo.progressPercentage + '%';
    }
}

// ==================== تحميل البلاغات ====================
async function loadUserReports(userId) {
    try {
        const reports = await getUserReports(userId);
        const container = document.getElementById('reportsListContainer');
        if (!container) return;

        if (reports.length === 0) {
            container.innerHTML = '<p class="empty-state">لا توجد بلاغات حتى الآن</p>';
            return;
        }

        container.innerHTML = reports.map(report => {
            const statusClass = `status-${report.status}`;
            const statusText = {
                'pending': 'قيد المراجعة',
                'approved': 'موافق عليه',
                'rejected': 'مرفوض'
            }[report.status] || report.status;

            const createdDate = new Date(report.created_at).toLocaleDateString('ar-EG');

            return `
                <div style="background: var(--color-muted); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; border-right: 4px solid ${getStatusColor(report.status)};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                        <div>
                            <h4 style="margin: 0; color: var(--color-text);">${report.title}</h4>
                            <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; color: var(--color-text-secondary);">
                                ${report.problem_type} • درجة الخطورة: ${report.severity}
                            </p>
                        </div>
                        <span class="status-badge ${statusClass}" style="white-space: nowrap;">${statusText}</span>
                    </div>
                    <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: var(--color-text-secondary);">
                        ${report.description.substring(0, 100)}${report.description.length > 100 ? '...' : ''}
                    </p>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem; font-size: 0.85rem;">
                        <span style="color: var(--color-text-secondary);">${createdDate}</span>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <span style="color: var(--color-accent); font-weight: 600;">
                                ${report.actual_points || report.estimated_points} نقطة
                            </span>
                            ${report.status === 'rejected' && report.rejection_reason ? `
                                <span style="color: var(--color-danger); font-size: 0.75rem;">السبب: ${report.rejection_reason}</span>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('خطأ في تحميل البلاغات:', error);
    }
}

// ==================== ربط نموذج البلاغ الجديد ====================
function bindReportForm(userId) {
    const form = document.getElementById('newReportForm');
    if (!form) return;

    // تحديث النقاط المتوقعة عند تغيير درجة الخطورة
    const severitySelect = document.getElementById('reportSeverity');
    if (severitySelect) {
        severitySelect.addEventListener('change', (e) => {
            const severity = e.target.value;
            const points = SEVERITY_POINTS[severity] || 0;
            const pointsDisplay = document.getElementById('estimatedReportPoints');
            if (pointsDisplay) {
                pointsDisplay.textContent = points + ' نقطة';
            }
        });
    }

    // معالجة إرسال النموذج
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const problemType = document.getElementById('reportProblemType').value;
        const severity = document.getElementById('reportSeverity').value;
        const title = document.getElementById('reportTitle').value;
        const description = document.getElementById('reportDescription').value;

        if (!problemType || !severity || !title || !description) {
            alert('يرجى ملء جميع الحقول المطلوبة');
            return;
        }

        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;

        try {
            await submitReport(userId, {
                problemType,
                severity,
                title,
                description
            });

            // إعادة تحميل البيانات
            await loadWalletData(userId);
            await loadUserReports(userId);

            // إعادة تعيين النموذج
            form.reset();
            const pointsDisplay = document.getElementById('estimatedReportPoints');
            if (pointsDisplay) {
                pointsDisplay.textContent = '0 نقطة';
            }

            // إظهار رسالة نجاح
            showNotification('تم إرسال البلاغ بنجاح! سيتم مراجعته قريباً.', 'success');

        } catch (error) {
            console.error('خطأ في إرسال البلاغ:', error);
            showNotification('حدث خطأ في إرسال البلاغ. يرجى المحاولة مرة أخرى.', 'error');
        } finally {
            btn.disabled = false;
        }
    });
}

// ==================== الاستماع لتحديثات المحفظة ====================
function subscribeToWalletUpdates(userId) {
    // هذا سيتم تنفيذه من خلال Supabase Real-time
    // في الملف الرئيسي للـ customer-dashboard.js
}

// ==================== دالة مساعدة للحصول على لون الحالة ====================
function getStatusColor(status) {
    const colors = {
        'pending': '#fbbf24',
        'approved': '#4ade80',
        'rejected': '#f87171'
    };
    return colors[status] || '#999';
}

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
    
    // إزالة الإشعار بعد 3 ثوان
    setTimeout(() => {
        notification.style.animation = 'slideOutNotification 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

export default {
    initRewardsDashboard,
    loadWalletData,
    loadUserReports,
    updateProBadgeInfo,
    updateProProgressBar
};
