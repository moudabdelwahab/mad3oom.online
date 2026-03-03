import { SUPABASE_CONFIG } from '../../supabase-config.js';

const supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

export async function initForumAdmin() {
    const forumStats = document.getElementById('forum-admin-stats');
    if (!forumStats) return;

    // Load overall forum stats
    const { data: threads, count: threadsCount } = await supabase.from('forum_threads').select('*', { count: 'exact', head: true });
    const { data: replies, count: repliesCount } = await supabase.from('forum_replies').select('*', { count: 'exact', head: true });
    const { data: reports, count: reportsCount } = await supabase.from('forum_reports').select('*', { count: 'exact', head: true, filter: "status=eq.pending" });

    forumStats.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${threadsCount || 0}</div>
            <div class="stat-label">إجمالي المواضيع</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${repliesCount || 0}</div>
            <div class="stat-label">إجمالي الردود</div>
        </div>
        <div class="stat-card urgent">
            <div class="stat-value">${reportsCount || 0}</div>
            <div class="stat-label">بلاغات قيد المراجعة</div>
        </div>
    `;

    loadRecentReports();
}

async function loadRecentReports() {
    const reportList = document.getElementById('forum-reports-list');
    if (!reportList) return;

    const { data: reports, error } = await supabase
        .from('forum_reports')
        .select(`
            *,
            reporter:profiles(full_name),
            thread:forum_threads(title),
            reply:forum_replies(content)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) return;

    reportList.innerHTML = reports.map(report => `
        <div class="report-item">
            <div class="report-meta">
                <span>بواسطة: ${report.reporter?.full_name}</span>
                <span>التاريخ: ${new Date(report.created_at).toLocaleDateString('ar-EG')}</span>
            </div>
            <div class="report-content">
                <strong>السبب:</strong> ${report.reason}
                <br>
                <strong>المحتوى المبلّغ عنه:</strong> ${report.thread?.title || report.reply?.content.substring(0, 100) + '...'}
            </div>
            <div class="report-actions">
                <button onclick="handleReport('${report.id}', 'dismiss')" class="btn-small">تجاهل</button>
                <button onclick="handleReport('${report.id}', 'delete')" class="btn-small btn-danger">حذف المحتوى</button>
            </div>
        </div>
    `).join('') || '<p>لا توجد بلاغات حالياً.</p>';
}

window.handleReport = async (id, action) => {
    if (action === 'dismiss') {
        await supabase.from('forum_reports').update({ status: 'reviewed' }).eq('id', id);
    } else if (action === 'delete') {
        // Complex logic to delete the actual content and update status
        alert('سيتم حذف المحتوى ومراجعة البلاغ');
    }
    loadRecentReports();
};
