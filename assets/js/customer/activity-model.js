/**
 * activity-model.js — ترجمة سجل النشاط إلى لغة يفهمها العميل.
 *
 * activity_logs جدول مشترك: بيتسجّل فيه نشاط العملاء **ونشاط الإدارة**
 * (impersonate، update_settings، admin_updated_role، waitlist_review،
 *  ticket_assignee_update، canned_response_create …).
 *
 * سياسة RLS بتحصر العميل في صفوفه هو، لكن الاعتماد على ده وحده مش كافي:
 * لو حدث إداري اتسجّل بالغلط بـ user_id بتاع عميل، الواجهة اللي بتعرض
 * أي action غير معروف كنص خام هتفضحه.
 *
 * علشان كده القاعدة هنا **allow-list**: اللي مش في القائمة ما يتعرضش أصلاً.
 * ده الافتراضي الآمن — إضافة حدث جديد للعرض قرار صريح، مش تلقائي.
 */

/** الأحداث المسموح بعرضها للعميل، وصياغتها بلغته. */
const CUSTOMER_VISIBLE_ACTIONS = Object.freeze({
    login:                      { label: 'تسجيل دخول إلى حسابك',        tone: 'neutral', group: 'security' },
    guest_login:                { label: 'دخول كزائر',                   tone: 'neutral', group: 'security' },
    logout:                     { label: 'تسجيل خروج',                   tone: 'neutral', group: 'security' },
    password_change:            { label: 'تغيير كلمة المرور',            tone: 'warning', group: 'security' },
    profile_updated:            { label: 'تحديث بيانات ملفك الشخصي',     tone: 'accent',  group: 'account'  },

    ticket_create:              { label: 'إنشاء تذكرة دعم',              tone: 'accent',  group: 'tickets'  },
    ticket_created:             { label: 'إنشاء تذكرة دعم',              tone: 'accent',  group: 'tickets'  },
    ticket_reply:               { label: 'إضافة رد على تذكرة',           tone: 'accent',  group: 'tickets'  },
    ticket_status_update:       { label: 'تغيّرت حالة تذكرة',            tone: 'success', group: 'tickets'  },
    ticket_closed:              { label: 'إغلاق تذكرة',                  tone: 'success', group: 'tickets'  },
    ticket_archive_by_customer: { label: 'إخفاء تذكرة من قائمتك',        tone: 'neutral', group: 'tickets'  },

    subscription_request:       { label: 'طلب اشتراك',                   tone: 'purple',  group: 'billing'  },
    subscription_activated:     { label: 'تفعيل اشتراك',                 tone: 'success', group: 'billing'  }
});

/** هل هذا الحدث مسموح بعرضه للعميل؟ */
export function isCustomerVisible(action) {
    return Object.prototype.hasOwnProperty.call(CUSTOMER_VISIBLE_ACTIONS, action);
}

export function actionInfo(action) {
    return CUSTOMER_VISIBLE_ACTIONS[action] || null;
}

/**
 * يحوّل صفوف activity_logs إلى عناصر جاهزة للعرض، ويسقط أي حدث غير مسموح.
 * details متعمّد إننا **مش** بنعرضه: ممكن يحتوي معرّفات أو ملاحظات داخلية.
 */
export function toTimeline(rows, { limit = 20 } = {}) {
    return (rows || [])
        .filter(row => isCustomerVisible(row?.action))
        .slice(0, limit)
        .map(row => {
            const info = actionInfo(row.action);
            return {
                id: row.id,
                label: info.label,
                tone: info.tone,
                group: info.group,
                createdAt: row.created_at,
                // معلومات الجهاز مفيدة أمنيًا للعميل، والـIP بيتعرض مختصرًا فقط
                device: row.device_info || null
            };
        });
}
