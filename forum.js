import { SUPABASE_CONFIG } from './supabase-config.js';
import { requireAuth } from './auth-client.js';
import { initCustomerSidebar } from './assets/js/customer-sidebar.js';
import { initSidebar as initAdminSidebar } from './assets/js/admin/sidebar.js';

// Initialize Supabase client
const supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

let currentUser = null;
let currentView = 'categories'; // categories, subforum, thread
let currentSubforumId = null;
let currentThreadId = null;

// --- DOM Elements ---
const forumContent = document.getElementById('forumContent');
const createThreadBtn = document.getElementById('createNewThread');
const threadModal = document.getElementById('threadModal');
const threadForm = document.getElementById('threadForm');
const closeModals = document.querySelectorAll('.close-modal');
const forumSearch = document.getElementById('forumSearch');
const forumFilter = document.getElementById('forumFilter');

// --- Initialization ---
async function init() {
    try {
        currentUser = await requireAuth();
        if (!currentUser) return;

        // Load appropriate sidebar
        if (currentUser.role === 'admin') {
            initAdminSidebar();
        } else {
            initCustomerSidebar();
        }

        setupEventListeners();
        loadCategories();
        setupRealtime();
    } catch (error) {
        console.error('Error initializing forum:', error);
        forumContent.innerHTML = '<div class="error-msg">حدث خطأ أثناء تحميل المنتدى. يرجى المحاولة لاحقاً.</div>';
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    createThreadBtn.addEventListener('click', () => {
        if (!currentUser) {
            alert('يرجى تسجيل الدخول أولاً');
            return;
        }
        loadSubforumsForModal();
        threadModal.classList.add('active');
    });

    closeModals.forEach(btn => {
        btn.addEventListener('click', () => {
            threadModal.classList.remove('active');
        });
    });

    threadForm.addEventListener('submit', handleThreadSubmit);

    forumSearch.addEventListener('input', debounce(() => {
        const query = forumSearch.value.trim();
        if (query.length > 2) {
            searchForum(query);
        } else if (query.length === 0) {
            loadCategories();
        }
    }, 500));

    forumFilter.addEventListener('change', () => {
        if (currentView === 'subforum') {
            loadSubforumThreads(currentSubforumId);
        }
    });

    // Rich Editor Toolbar
    const toolbarButtons = document.querySelectorAll('.editor-toolbar button[data-cmd]');
    toolbarButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.getAttribute('data-cmd');
            document.execCommand(cmd, false, null);
        });
    });

    document.getElementById('insertCode').addEventListener('click', () => {
        const code = prompt('أدخل الكود هنا:');
        if (code) {
            document.execCommand('insertHTML', false, `<pre><code>${escapeHtml(code)}</code></pre>`);
        }
    });

    document.getElementById('uploadImg').addEventListener('click', () => {
        const url = prompt('أدخل رابط الصورة:');
        if (url) {
            document.execCommand('insertImage', false, url);
        }
    });
}

// --- Core Functions ---

async function loadCategories() {
    currentView = 'categories';
    forumContent.innerHTML = '<div class="loading-spinner">جاري تحميل الأقسام...</div>';

    const { data: categories, error } = await supabase
        .from('forum_categories')
        .select(`
            *,
            forum_subforums (*)
        `)
        .order('display_order');

    if (error) throw error;

    renderCategories(categories);
}

function renderCategories(categories) {
    let html = '';
    categories.forEach(cat => {
        html += `
            <section class="category-section">
                <h2 class="category-title">${cat.name}</h2>
                <div class="subforum-list">
                    ${cat.forum_subforums.map(sub => `
                        <div class="subforum-card" onclick="window.forum.openSubforum('${sub.id}')">
                            <div class="subforum-icon">
                                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            </div>
                            <div class="subforum-info">
                                <h3>${sub.name}</h3>
                                <p>${sub.description || ''}</p>
                            </div>
                            <div class="subforum-stats">
                                <div class="stat-item">
                                    <span>${sub.threads_count || 0}</span>
                                    <label>موضوع</label>
                                </div>
                                <div class="stat-item">
                                    <span>${sub.posts_count || 0}</span>
                                    <label>مشاركة</label>
                                </div>
                            </div>
                            <div class="subforum-last-post">
                                ${sub.last_activity_at ? `
                                    <span class="last-post-meta">آخر نشاط: ${formatDate(sub.last_activity_at)}</span>
                                ` : '<span class="last-post-meta">لا توجد نشاطات بعد</span>'}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>
        `;
    });
    forumContent.innerHTML = html || '<p class="empty-msg">لا توجد أقسام متاحة حالياً.</p>';
}

async function openSubforum(subforumId) {
    currentView = 'subforum';
    currentSubforumId = subforumId;
    forumContent.innerHTML = '<div class="loading-spinner">جاري تحميل المواضيع...</div>';

    const { data: subforum, error: subError } = await supabase
        .from('forum_subforums')
        .select('*')
        .eq('id', subforumId)
        .single();

    if (subError) throw subError;

    loadSubforumThreads(subforumId, subforum.name);
}

async function loadSubforumThreads(subforumId, subforumName) {
    let query = supabase
        .from('forum_threads')
        .select(`
            *,
            author:profiles(full_name, avatar_url)
        `)
        .eq('subforum_id', subforumId);

    // Apply Filters
    const filter = forumFilter.value;
    if (filter === 'popular') query = query.order('views_count', { ascending: false });
    else if (filter === 'unanswered') query = query.eq('replies_count', 0);
    else if (filter === 'activity') query = query.order('last_post_at', { ascending: false });
    else query = query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false });

    const { data: threads, error } = await query;

    if (error) throw error;

    renderThreads(threads, subforumName);
}

function renderThreads(threads, subforumName) {
    let html = `
        <div class="breadcrumb">
            <a href="#" onclick="window.forum.loadCategories()">الرئيسية</a> &raquo; <span>${subforumName}</span>
        </div>
        <div class="thread-list">
            ${threads.map(thread => `
                <div class="thread-card ${thread.is_pinned ? 'pinned' : ''}" onclick="window.forum.openThread('${thread.id}')">
                    <div class="thread-main">
                        <div class="author-avatar">
                            ${thread.author?.avatar_url ? `<img src="${thread.author.avatar_url}" alt="">` : (thread.author?.full_name?.charAt(0) || 'U')}
                        </div>
                        <div class="thread-details">
                            <h3>
                                ${thread.is_pinned ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="margin-left:5px"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>' : ''}
                                ${thread.title}
                            </h3>
                            <div class="thread-meta">
                                <span>بواسطة: ${thread.author?.full_name || 'مستخدم مجهول'}</span>
                                <span>${formatDate(thread.created_at)}</span>
                                ${thread.tags ? `<div class="tags">${thread.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="thread-stats">
                        <div class="thread-stat">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            ${thread.replies_count}
                        </div>
                        <div class="thread-stat">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            ${thread.views_count}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    forumContent.innerHTML = html || '<p class="empty-msg">لا توجد مواضيع في هذا القسم بعد.</p>';
}

async function handleThreadSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('threadTitle').value;
    const subforumId = document.getElementById('threadSubforum').value;
    const content = document.getElementById('threadContent').innerHTML;
    const tags = document.getElementById('threadTags').value.split(',').map(t => t.trim()).filter(t => t);

    if (!content.trim() || content === '<br>') {
        alert('يرجى كتابة محتوى الموضوع');
        return;
    }

    const slug = slugify(title) + '-' + Math.random().toString(36).substr(2, 5);

    const { data, error } = await supabase
        .from('forum_threads')
        .insert([{
            title,
            subforum_id: subforumId,
            author_id: currentUser.id,
            content,
            slug,
            tags
        }])
        .select()
        .single();

    if (error) {
        alert('خطأ في نشر الموضوع: ' + error.message);
    } else {
        threadModal.classList.remove('active');
        threadForm.reset();
        document.getElementById('threadContent').innerHTML = '';
        openThread(data.id);
    }
}

async function openThread(threadId) {
    currentView = 'thread';
    currentThreadId = threadId;
    
    // Increment views
    await supabase.rpc('increment_thread_views', { thread_id: threadId });

    const { data: thread, error } = await supabase
        .from('forum_threads')
        .select(`
            *,
            author:profiles(full_name, avatar_url, role),
            replies:forum_replies(
                *,
                author:profiles(full_name, avatar_url, role)
            )
        `)
        .eq('id', threadId)
        .single();

    if (error) throw error;

    renderThreadDetail(thread);
}

function renderThreadDetail(thread) {
    let html = `
        <div class="breadcrumb">
            <a href="#" onclick="window.forum.loadCategories()">الرئيسية</a> &raquo; <span>${thread.title}</span>
        </div>
        <div class="thread-detail-container">
            <div class="post-item original-post">
                <div class="post-sidebar">
                    <div class="author-avatar-large">
                        ${thread.author?.avatar_url ? `<img src="${thread.author.avatar_url}" alt="">` : (thread.author?.full_name?.charAt(0) || 'U')}
                    </div>
                    <div class="author-name">${thread.author?.full_name || 'مستخدم مجهول'}</div>
                    <div class="author-role">${thread.author?.role || 'عضو'}</div>
                </div>
                <div class="post-content-wrapper">
                    <div class="post-header">
                        <span class="post-date">${formatDate(thread.created_at)}</span>
                        <div class="post-actions">
                            ${currentUser.id === thread.author_id || currentUser.role === 'admin' ? `
                                <button onclick="window.forum.editThread('${thread.id}')">تعديل</button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="post-body">
                        <h2>${thread.title}</h2>
                        <div class="content">${thread.content}</div>
                    </div>
                </div>
            </div>

            <div class="replies-section">
                <h3>الردود (${thread.replies?.length || 0})</h3>
                ${thread.replies?.map(reply => `
                    <div class="post-item reply-item" id="reply-${reply.id}">
                        <div class="post-sidebar">
                            <div class="author-avatar-small">
                                ${reply.author?.avatar_url ? `<img src="${reply.author.avatar_url}" alt="">` : (reply.author?.full_name?.charAt(0) || 'U')}
                            </div>
                            <div class="author-name">${reply.author?.full_name || 'مستخدم مجهول'}</div>
                        </div>
                        <div class="post-content-wrapper">
                            <div class="post-header">
                                <span class="post-date">${formatDate(reply.created_at)}</span>
                                <div class="post-actions">
                                    <button onclick="window.forum.quoteReply('${reply.id}')">اقتباس</button>
                                </div>
                            </div>
                            <div class="post-body">
                                <div class="content">${reply.content}</div>
                            </div>
                        </div>
                    </div>
                `).join('') || '<p class="empty-msg">لا توجد ردود بعد. كن أول من يعلق!</p>'}
            </div>

            <div class="quick-reply">
                <h3>أضف رداً</h3>
                <div id="replyEditor" contenteditable="true" class="rich-editor" placeholder="اكتب ردك هنا..."></div>
                <button onclick="window.forum.submitReply()" class="btn btn-primary" style="margin-top:1rem">إرسال الرد</button>
            </div>
        </div>
    `;
    forumContent.innerHTML = html;
}

async function submitReply() {
    const content = document.getElementById('replyEditor').innerHTML;
    if (!content.trim() || content === '<br>') return;

    const { error } = await supabase
        .from('forum_replies')
        .insert([{
            thread_id: currentThreadId,
            author_id: currentUser.id,
            content
        }]);

    if (error) {
        alert('خطأ في إرسال الرد');
    } else {
        openThread(currentThreadId); // Refresh
    }
}

// --- Helpers ---

async function loadSubforumsForModal() {
    const select = document.getElementById('threadSubforum');
    const { data, error } = await supabase.from('forum_subforums').select('id, name');
    if (data) {
        select.innerHTML = data.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
}

function setupRealtime() {
    supabase.channel('forum-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_notifications', filter: `user_id=eq.${currentUser.id}` }, payload => {
            showNotification(payload.new);
        })
        .subscribe();
}

function showNotification(notif) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = 'forum-toast';
    toast.innerText = 'لديك إشعار جديد في المنتدى';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\u0621-\u064A-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Expose functions to global window for onclick events
window.forum = {
    loadCategories,
    openSubforum,
    openThread,
    submitReply,
    editThread: (id) => console.log('Edit', id),
    quoteReply: (id) => {
        const reply = document.querySelector(`#reply-${id} .content`).innerHTML;
        document.getElementById('replyEditor').innerHTML = `<blockquote>${reply}</blockquote><br>`;
        document.getElementById('replyEditor').focus();
    }
};

init();
