// pro-badge.js - إدارة ميزة شارة Pro التلقائية عند الوصول لـ 1000 نقطة

/**
 * شارة Pro:
 * - تظهر تلقائياً عند الوصول لـ 1000 نقطة
 * - تظهر جنب اسم المستخدم في جميع الصفحات
 * - تعطي مزايا خاصة للمستخدم
 */

// ==================== إضافة شارة Pro إلى العناصر ====================
export function addProBadgeToElement(element, isPro = false) {
    if (!element) return;

    // إزالة الشارة القديمة إن وجدت
    const oldBadge = element.querySelector('.pro-badge');
    if (oldBadge) oldBadge.remove();

    if (isPro) {
        const badge = document.createElement('span');
        badge.className = 'pro-badge';
        badge.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px; display: inline-block; margin-right: 0.25rem;">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
            </svg>
            Pro
        `;
        badge.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            padding: 0.25rem 0.75rem;
            background: linear-gradient(135deg, #fbbf24, #f59e0b);
            color: white;
            border-radius: 1rem;
            font-size: 0.75rem;
            font-weight: 700;
            margin-left: 0.5rem;
            white-space: nowrap;
        `;
        element.appendChild(badge);
    }
}

// ==================== تحديث شارة Pro في الملف الشخصي ====================
export function updateProBadgeInProfile(userName, isPro = false) {
    // تحديث في لوحة العميل
    const profileNameElement = document.querySelector('.profile-name, [data-profile-name]');
    if (profileNameElement) {
        addProBadgeToElement(profileNameElement, isPro);
    }

    // تحديث في شريط الملاحة
    const navUserElement = document.querySelector('.nav-user-name, .profile-nav-item');
    if (navUserElement) {
        addProBadgeToElement(navUserElement, isPro);
    }
}

// ==================== تحديث شارة Pro في البطاقات ====================
export function updateProBadgeInCards(userId, isPro = false) {
    // تحديث في قائمة المستخدمين (Admin)
    const userRows = document.querySelectorAll('table tbody tr');
    userRows.forEach(row => {
        const userCell = row.querySelector('td:first-child');
        if (userCell && userCell.textContent.includes(userId)) {
            addProBadgeToElement(userCell, isPro);
        }
    });
}

// ==================== عرض إشعار شارة Pro ====================
export function showProBadgeNotification(userName) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #fbbf24, #f59e0b);
        color: white;
        padding: 2rem;
        border-radius: 1rem;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        z-index: 10001;
        text-align: center;
        max-width: 400px;
        animation: proBadgePopup 0.5s ease;
    `;

    notification.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 1rem;">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 60px; height: 60px; display: inline-block;">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
            </svg>
        </div>
        <h2 style="margin: 0 0 0.5rem 0; font-size: 1.5rem;">تهانينا!</h2>
        <p style="margin: 0 0 1rem 0; font-size: 1rem; opacity: 0.9;">لقد وصلت إلى 1000 نقطة وأصبحت عضو Pro متميز!</p>
        <p style="margin: 0; font-size: 0.9rem; opacity: 0.8;">استمتع بالمزايا الحصرية والدعم الأولوي</p>
    `;

    // إضافة أنماط الحركة
    const style = document.createElement('style');
    style.textContent = `
        @keyframes proBadgePopup {
            from {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.5);
            }
            to {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
        }
        @keyframes proBadgeFadeOut {
            from {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
            to {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.5);
            }
        }
    `;
    if (!document.querySelector('style[data-pro-badge]')) {
        style.setAttribute('data-pro-badge', 'true');
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // إزالة الإشعار بعد 4 ثوان
    setTimeout(() => {
        notification.style.animation = 'proBadgeFadeOut 0.5s ease';
        setTimeout(() => notification.remove(), 500);
    }, 4000);
}

// ==================== تحديث حالة Pro في الملف الشخصي ====================
export async function updateProStatusInProfile(user, wallet) {
    if (!user || !wallet) return;

    const isPro = wallet.is_pro || wallet.total_points >= 1000;

    // تحديث في قاعدة البيانات
    if (isPro && !wallet.is_pro) {
        // إذا كان يجب تحديث حالة Pro
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_pro: true })
                .eq('id', user.id);

            if (error) throw error;

            // عرض الإشعار
            showProBadgeNotification(user.email);
        } catch (error) {
            console.error('خطأ في تحديث حالة Pro:', error);
        }
    }

    // تحديث الواجهة
    updateProBadgeInProfile(user.email, isPro);
}

// ==================== إضافة شارة Pro إلى التعليقات والردود ====================
export function addProBadgeToComments(userId, isPro = false) {
    const userComments = document.querySelectorAll(`[data-user-id="${userId}"]`);
    userComments.forEach(comment => {
        addProBadgeToElement(comment, isPro);
    });
}

// ==================== إضافة شارة Pro إلى الملف الشخصي العام ====================
export function addProBadgeToPublicProfile(profileElement, isPro = false) {
    if (!profileElement) return;

    const profileHeader = profileElement.querySelector('.profile-header, .profile-info');
    if (profileHeader) {
        addProBadgeToElement(profileHeader, isPro);
    }
}

// ==================== تحديث شارة Pro عند تحديث النقاط ====================
export function subscribeToProBadgeUpdates(userId, onProStatusChange) {
    // هذا سيتم تنفيذه من خلال Supabase Real-time
    // للاستماع لتحديثات النقاط والحالة
    
    if (typeof supabase === 'undefined') return;

    supabase
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${userId}`
        }, (payload) => {
            if (payload.new.is_pro !== payload.old.is_pro) {
                if (payload.new.is_pro) {
                    showProBadgeNotification(payload.new.email);
                }
                if (onProStatusChange) {
                    onProStatusChange(payload.new.is_pro);
                }
            }
        })
        .subscribe();
}

// ==================== إضافة CSS لشارة Pro ====================
export function injectProBadgeStyles() {
    const style = document.createElement('style');
    style.setAttribute('data-pro-badge-styles', 'true');
    style.textContent = `
        .pro-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            padding: 0.25rem 0.75rem;
            background: linear-gradient(135deg, #fbbf24, #f59e0b);
            color: white;
            border-radius: 1rem;
            font-size: 0.75rem;
            font-weight: 700;
            margin-left: 0.5rem;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(251, 191, 36, 0.3);
            animation: proBadgeGlow 2s ease-in-out infinite;
        }

        @keyframes proBadgeGlow {
            0%, 100% {
                box-shadow: 0 2px 8px rgba(251, 191, 36, 0.3);
            }
            50% {
                box-shadow: 0 4px 16px rgba(251, 191, 36, 0.6);
            }
        }

        .pro-badge svg {
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
        }

        /* شارة Pro في البطاقات */
        .ticket-card.pro-user::before,
        .user-card.pro-user::before {
            content: '';
            position: absolute;
            top: -8px;
            right: -8px;
            width: 24px;
            height: 24px;
            background: linear-gradient(135deg, #fbbf24, #f59e0b);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(251, 191, 36, 0.4);
        }

        /* شارة Pro في الجداول */
        table tbody tr.pro-user td:first-child::after {
            content: '★';
            color: #fbbf24;
            font-weight: bold;
            margin-left: 0.5rem;
        }
    `;

    if (!document.querySelector('style[data-pro-badge-styles]')) {
        document.head.appendChild(style);
    }
}

// ==================== التصدير الافتراضي لزيادة التوافقية ====================
export default {
    addProBadgeToElement,
    updateProBadgeInProfile,
    updateProBadgeInCards,
    showProBadgeNotification,
    updateProStatusInProfile,
    addProBadgeToComments,
    addProBadgeToPublicProfile,
    subscribeToProBadgeUpdates,
    injectProBadgeStyles
};
