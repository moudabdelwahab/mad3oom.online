import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';
import { escapeHtml, debounce } from './admin-utils.js';
import { logActivity } from '/activity-service.js';

let user = null;
let allEntries = [];
let activeEntryId = null;

const STATUS_LABELS = {
    pending: 'قيد المراجعة',
    approved: 'تمت الموافقة',
    rejected: 'مرفوض'
};

const STATUS_CLASSES = {
    pending: 'status-pending',
    approved: 'status-resolved',
    rejected: 'status-danger'
};

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return;

    updateAdminUI(user);
    await loadEntries();
    setupEventListeners();
}

async function loadEntries() {
    const body = document.getElementById('waitlistBody');

    const { data, error } = await supabase
        .from('waitlist_entries')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading waitlist entries:', error);
        body.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">تعذر تحميل قائمة الانتظار</td></tr>';
        return;
    }

    allEntries = data || [];
    renderEntries();
}

function renderEntries() {
    const body = document.getElementById('waitlistBody');
    const search = document.getElementById('waitlistSearch').value.trim().toLowerCase();
    const statusFilter = document.getElementById('waitlistStatusFilter').value;

    const filtered = allEntries.filter((entry) => {
        if (statusFilter && entry.status !== statusFilter) return false;
        if (!search) return true;
        return (
            (entry.name || '').toLowerCase().includes(search) ||
            (entry.email || '').toLowerCase().includes(search) ||
            (entry.phone || '').toLowerCase().includes(search)
        );
    });

    if (filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">لا توجد طلبات مطابقة</td></tr>';
        return;
    }

    body.innerHTML = filtered.map((entry) => `
        <tr>
            <td>${escapeHtml(entry.name)}</td>
            <td>${escapeHtml(entry.email)}</td>
            <td>${escapeHtml(entry.phone || '—')}</td>
            <td><span class="status-badge ${STATUS_CLASSES[entry.status] || 'status-pending'}">${STATUS_LABELS[entry.status] || entry.status}</span></td>
            <td>${new Date(entry.created_at).toLocaleDateString('ar-EG')}</td>
            <td><button class="btn btn-secondary btn-sm view-entry-btn" data-entry-id="${entry.id}">عرض</button></td>
        </tr>
    `).join('');

    document.querySelectorAll('.view-entry-btn').forEach((btn) => {
        btn.addEventListener('click', () => openDetailModal(btn.dataset.entryId));
    });
}

function openDetailModal(entryId) {
    const entry = allEntries.find((e) => e.id === entryId);
    if (!entry) return;

    activeEntryId = entry.id;

    document.getElementById('detailName').textContent = entry.name;
    document.getElementById('detailEmail').textContent = entry.email;
    document.getElementById('detailPhone').textContent = entry.phone || '—';
    document.getElementById('detailStatus').textContent = STATUS_LABELS[entry.status] || entry.status;
    document.getElementById('detailCreatedAt').textContent = new Date(entry.created_at).toLocaleString('ar-EG');

    const reviewedRow = document.getElementById('detailReviewedRow');
    if (entry.reviewed_at) {
        reviewedRow.style.display = 'flex';
        document.getElementById('detailReviewedAt').textContent = new Date(entry.reviewed_at).toLocaleString('ar-EG');
    } else {
        reviewedRow.style.display = 'none';
    }

    document.getElementById('detailApproveBtn').style.display = entry.status === 'approved' ? 'none' : 'inline-flex';
    document.getElementById('detailRejectBtn').style.display = entry.status === 'rejected' ? 'none' : 'inline-flex';

    document.getElementById('waitlistDetailModal').style.display = 'block';
}

function closeDetailModal() {
    document.getElementById('waitlistDetailModal').style.display = 'none';
    activeEntryId = null;
}

// الموافقة تُنشئ حسابًا حقيقيًا (auth user + profile) عبر edge function
// تعمل بمفتاح service role، لأن العميل لا يملك صلاحية إنشاء الحسابات.
// الرفض مجرد تحديث حالة، فيتم مباشرةً عبر RLS.
async function approveEntry() {
    if (!activeEntryId) return;

    const entryId = activeEntryId;
    const approveBtn = document.getElementById('detailApproveBtn');
    const originalLabel = approveBtn.textContent;
    approveBtn.disabled = true;
    approveBtn.textContent = 'جاري إنشاء الحساب...';

    try {
        const { data, error } = await supabase.functions.invoke('approve-waitlist-entry', {
            body: { entry_id: entryId }
        });

        // أخطاء الـ edge function ترجع الرسالة داخل جسم الاستجابة، مش في error.message.
        const failure = error ? (await readInvokeError(error)) || error.message : data?.error;
        if (failure) {
            showToast(failure || 'حدث خطأ أثناء إنشاء الحساب', 'error');
            return;
        }

        logActivity('waitlist_review', `Approved waitlist entry ${entryId} (account ${data.user_id})`);
        closeDetailModal();
        await loadEntries();
        showCredentials(data);
    } finally {
        approveBtn.disabled = false;
        approveBtn.textContent = originalLabel;
    }
}

async function readInvokeError(error) {
    try {
        const body = await error.context?.json();
        return body?.error || null;
    } catch {
        return null;
    }
}

async function rejectEntry() {
    if (!activeEntryId) return;

    const entryId = activeEntryId;

    const { error } = await supabase
        .from('waitlist_entries')
        .update({
            status: 'rejected',
            reviewed_at: new Date().toISOString(),
            reviewed_by: user.id
        })
        .eq('id', entryId);

    if (error) {
        showToast(error.message || 'حدث خطأ أثناء تحديث الحالة', 'error');
        return;
    }

    logActivity('waitlist_review', `Rejected waitlist entry ${entryId}`);
    showToast('تم رفض الطلب', 'success');
    closeDetailModal();
    await loadEntries();
}

// كلمة المرور المؤقتة تُعرض مرة واحدة فقط ولا تُخزَّن، فلازم الأدمن ينسخها الآن.
function showCredentials(result) {
    document.getElementById('credEmail').textContent = result.email;

    const passwordRow = document.getElementById('credPasswordRow');
    const note = document.getElementById('credNote');

    if (result.temp_password) {
        passwordRow.style.display = 'flex';
        document.getElementById('credPassword').textContent = result.temp_password;
        note.textContent = 'الحساب مفعَّل ومؤكَّد بدون بريد تحقق. كلمة المرور المؤقتة دي بتظهر مرة واحدة بس ومش متخزنة في أي مكان — انسخها وابعتها للعميل ونبّهه يغيّرها بعد أول تسجيل دخول.';
    } else {
        passwordRow.style.display = 'none';
        document.getElementById('credPassword').textContent = '';
        note.textContent = result.already_approved
            ? 'الطلب ده متوافق عليه قبل كده والحساب موجود بالفعل. لو العميل نسي كلمة المرور، استخدم "نسيت كلمة المرور".'
            : 'البريد ده كان له حساب بالفعل، فتم ربط الطلب بالحساب القائم بدون تغيير كلمة مروره.';
    }

    document.getElementById('waitlistCredentialsModal').style.display = 'block';
}

function closeCredentialsModal() {
    document.getElementById('waitlistCredentialsModal').style.display = 'none';
}

async function copyCredentials() {
    const email = document.getElementById('credEmail').textContent;
    const password = document.getElementById('credPassword').textContent;
    const text = password ? `${email}\n${password}` : email;

    try {
        await navigator.clipboard.writeText(text);
        showToast('تم نسخ البيانات', 'success');
    } catch {
        showToast('تعذر النسخ، انسخ البيانات يدويًا', 'error');
    }
}

function setupEventListeners() {
    document.getElementById('waitlistSearch').addEventListener('input', debounce(renderEntries, 250));
    document.getElementById('waitlistStatusFilter').addEventListener('change', renderEntries);

    document.getElementById('detailCloseBtn').addEventListener('click', closeDetailModal);
    document.getElementById('detailApproveBtn').addEventListener('click', approveEntry);
    document.getElementById('detailRejectBtn').addEventListener('click', rejectEntry);

    document.getElementById('credCloseBtn').addEventListener('click', closeCredentialsModal);
    document.getElementById('credCopyBtn').addEventListener('click', copyCredentials);
    document.getElementById('waitlistCredentialsModal').addEventListener('click', (e) => {
        if (e.target.id === 'waitlistCredentialsModal') closeCredentialsModal();
    });

    document.getElementById('waitlistDetailModal').addEventListener('click', (e) => {
        if (e.target.id === 'waitlistDetailModal') closeDetailModal();
    });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = type === 'success' ? 'var(--color-success)' : 'var(--color-danger)';
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

init();
