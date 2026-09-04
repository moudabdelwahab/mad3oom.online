/**
 * UI Service — طبقة موحّدة للتنبيهات والحوارات في لوحة العميل.
 *
 * الهدف: مصدر واحد لكل رسائل النجاح/الخطأ/التأكيد بدل alert() المتناثرة،
 * بحيث تكون كلها بنفس الهوية البصرية وبنفس السلوك (RTL، لوحة مفاتيح، ARIA).
 *
 * ملاحظة أمان: كل النصوص الواردة تُحقن عبر textContent وليس innerHTML، لأن
 * أغلبها بيجي من قاعدة البيانات (عناوين تذاكر، رسائل خطأ من السيرفر).
 */

const PALETTE = {
    success: { color: '#22C58B', icon: '✓' },
    error:   { color: '#FF6B6B', icon: '✕' },
    info:    { color: '#4DA3FF', icon: 'ℹ' },
    warning: { color: '#F5A623', icon: '!' }
};

function injectAnimations() {
    if (document.getElementById('ui-service-animations')) return;
    const style = document.createElement('style');
    style.id = 'ui-service-animations';
    style.textContent = `
        @keyframes uiToastIn  { from { transform: translateY(-16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes uiToastOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-12px); opacity: 0; } }
        @keyframes uiDialogIn { from { transform: scale(.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
            #ui-toast-container > *, .ui-dialog { animation: none !important; }
        }
    `;
    document.head.appendChild(style);
}

/** يبني غلاف الحوار (overlay + بطاقة) مع إدارة التركيز ومفتاح Escape. */
function buildDialog({ type = 'info', title, message, actions }) {
    injectAnimations();
    const { color, icon } = PALETTE[type] || PALETTE.info;
    const lastFocused = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'ui-dialog-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 10000; display: flex;
        align-items: center; justify-content: center; padding: 1.25rem;
        background: rgba(3,7,15,.72); backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px); direction: rtl;
    `;

    const card = document.createElement('div');
    card.className = 'ui-dialog';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');
    card.style.cssText = `
        background: var(--color-surface, #0D1622); color: var(--color-text, #F3F6FB);
        width: 100%; max-width: 26rem; border-radius: 1.15rem; overflow: hidden;
        border: 1px solid var(--color-border, rgba(255,255,255,.09));
        box-shadow: 0 30px 80px -25px rgba(0,8,25,.75);
        animation: uiDialogIn .22s cubic-bezier(.34,1.4,.64,1);
        font-family: inherit;
    `;

    const accent = document.createElement('div');
    accent.style.cssText = `height: 4px; background: ${color};`;

    const body = document.createElement('div');
    body.style.cssText = 'padding: 1.75rem 1.5rem 1.5rem; text-align: center;';

    const iconEl = document.createElement('div');
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon;
    iconEl.style.cssText = `
        width: 3.25rem; height: 3.25rem; margin: 0 auto 1rem; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.5rem; font-weight: 700; color: ${color};
        background: ${color}1F; border: 1px solid ${color}3D;
    `;

    const titleEl = document.createElement('h3');
    titleEl.textContent = title || '';
    titleEl.style.cssText = 'margin: 0 0 .5rem; font-size: 1.15rem; font-weight: 800; line-height: 1.4;';
    card.setAttribute('aria-label', title || '');

    const msgEl = document.createElement('p');
    msgEl.textContent = message || '';
    msgEl.style.cssText = `
        margin: 0 0 1.5rem; line-height: 1.7; font-size: .92rem;
        color: var(--color-text-secondary, #94A6C2); white-space: pre-wrap;
    `;

    const actionsEl = document.createElement('div');
    actionsEl.style.cssText = 'display: flex; gap: .65rem;';

    body.append(iconEl, titleEl, msgEl, actionsEl);
    card.append(accent, body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let closed = false;
    const close = (result, settle) => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKeydown, true);
        overlay.style.transition = 'opacity .18s ease';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 180);
        if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
        settle(result);
    };

    let onKeydown = () => {};

    const promise = new Promise((resolve) => {
        actions.forEach((action, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = action.label;
            const isPrimary = action.style === 'primary' || action.style === 'danger';
            btn.style.cssText = `
                flex: 1; padding: .7rem 1rem; border-radius: .65rem; cursor: pointer;
                font-weight: 700; font-size: .9rem; font-family: inherit;
                transition: filter .15s ease, background .15s ease;
                border: 1px solid ${isPrimary ? 'transparent' : 'var(--color-border, rgba(255,255,255,.09))'};
                background: ${action.style === 'danger' ? '#FF6B6B'
                            : action.style === 'primary' ? 'var(--color-accent, #0077CC)'
                            : 'var(--color-muted, #101B2C)'};
                color: ${isPrimary ? '#fff' : 'var(--color-text, #F3F6FB)'};
            `;
            btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(1.12)'; });
            btn.addEventListener('mouseleave', () => { btn.style.filter = 'none'; });
            btn.addEventListener('click', () => close(action.value, resolve));
            actionsEl.appendChild(btn);
            if (index === actions.length - 1) setTimeout(() => btn.focus(), 30);
        });

        // Escape يلغي دائماً بالقيمة الآمنة (أول إجراء = الإلغاء عرفاً هنا)،
        // وTab محبوس جوه الحوار عشان التركيز ميهربش لخلفية الصفحة.
        onKeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close(actions[0].value, resolve);
            } else if (e.key === 'Tab') {
                const focusables = Array.from(actionsEl.querySelectorAll('button'));
                if (!focusables.length) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault(); last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault(); first.focus();
                }
            }
        };
        document.addEventListener('keydown', onKeydown, true);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(actions[0].value, resolve);
        });
    });

    return promise;
}

export const ui = {
    /**
     * تنبيه سريع غير مُعطِّل. يُستخدم لتأكيد نجاح إجراء أو الإبلاغ عن فشله.
     * @param {string} message
     * @param {'success'|'error'|'info'|'warning'} type
     * @param {number} duration بالمللي ثانية
     */
    showToast(message, type = 'info', duration = 4000) {
        injectAnimations();
        let container = document.getElementById('ui-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ui-toast-container';
            container.setAttribute('role', 'status');
            container.setAttribute('aria-live', 'polite');
            container.style.cssText = `
                position: fixed; top: 1.25rem; left: 50%; transform: translateX(-50%);
                z-index: 10001; display: flex; flex-direction: column; gap: .6rem;
                width: min(26rem, calc(100vw - 2rem)); pointer-events: none; direction: rtl;
            `;
            document.body.appendChild(container);
        }

        const { color, icon } = PALETTE[type] || PALETTE.info;
        const toast = document.createElement('div');
        toast.style.cssText = `
            display: flex; align-items: center; gap: .75rem; padding: .8rem 1rem;
            border-radius: .8rem; pointer-events: auto; font-size: .9rem; font-weight: 600;
            background: var(--color-surface-2, #121F30); color: var(--color-text, #F3F6FB);
            border: 1px solid ${color}45; border-right: 3px solid ${color};
            box-shadow: 0 18px 40px -18px rgba(0,8,25,.8);
            animation: uiToastIn .3s cubic-bezier(.34,1.3,.64,1) forwards;
        `;

        const iconEl = document.createElement('span');
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.textContent = icon;
        iconEl.style.cssText = `
            flex-shrink: 0; width: 1.4rem; height: 1.4rem; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            background: ${color}26; color: ${color}; font-size: .78rem; font-weight: 800;
        `;

        const textEl = document.createElement('span');
        textEl.textContent = message;
        textEl.style.cssText = 'flex: 1; line-height: 1.5;';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'إغلاق التنبيه');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: none; border: none; cursor: pointer; font-size: 1.25rem;
            line-height: 1; padding: 0 .15rem; opacity: .55;
            color: var(--color-text-secondary, #94A6C2);
        `;

        const dismiss = () => {
            toast.style.animation = 'uiToastOut .3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        };
        closeBtn.addEventListener('click', dismiss);

        toast.append(iconEl, textEl, closeBtn);
        container.appendChild(toast);
        setTimeout(dismiss, duration);
    },

    /** حوار إعلامي بزر واحد. */
    showAlert(title, message, type = 'info') {
        return buildDialog({
            type, title, message,
            actions: [{ label: 'حسناً', value: true, style: 'primary' }]
        });
    },

    /**
     * حوار تأكيد. يرجّع Promise<boolean> — لا يُنفَّذ أي إجراء إلا بعد true.
     * يُستخدم قبل أي عملية غير قابلة للتراجع.
     */
    showConfirm(title, message, {
        confirmLabel = 'تأكيد',
        cancelLabel = 'إلغاء',
        type = 'warning',
        danger = false
    } = {}) {
        return buildDialog({
            type, title, message,
            actions: [
                { label: cancelLabel, value: false, style: 'secondary' },
                { label: confirmLabel, value: true, style: danger ? 'danger' : 'primary' }
            ]
        });
    }
};
