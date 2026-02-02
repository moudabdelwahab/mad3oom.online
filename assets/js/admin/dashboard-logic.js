import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { fetchTicketStats, subscribeToTickets } from '/tickets-service.js';
import { initSidebar } from './sidebar.js';

let user = null;

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return; 
    
    updateAdminUI(user);
    
    // تحميل جميع الإحصائيات
    await loadAllStats();
    
    // الاشتراك في التحديثات الفورية
    subscribeToTickets(() => {
        loadAllStats();
    });
}

async function loadAllStats() {
    await Promise.all([
        loadTicketsStats(),
        loadChatStats(),
        loadUsersStats(),
        loadBannedStats(),
        loadActivityStats()
    ]);
}

// إحصائيات التذاكر
async function loadTicketsStats() {
    try {
        const stats = await fetchTicketStats();
        
        // تحديث الأرقام
        updateElement('ticketsOpen', stats.open);
        updateElement('ticketsInProgress', stats.inProgress);
        updateElement('ticketsResolved', stats.resolved);
        
        // حساب المغلقة (المحلولة)
        updateElement('ticketsClosed', stats.resolved);
    } catch (err) {
        console.error('Error loading tickets stats:', err);
    }
}

// إحصائيات المحادثات
async function loadChatStats() {
    try {
        const { data: sessions } = await supabase
            .from('chat_sessions')
            .select('status');
        
        if (sessions) {
            const active = sessions.filter(s => s.status === 'active').length;
            const closed = sessions.filter(s => s.status === 'closed').length;
            
            updateElement('chatActive', active);
            updateElement('chatClosed', closed);
        }
    } catch (err) {
        console.error('Error loading chat stats:', err);
        updateElement('chatActive', '-');
        updateElement('chatClosed', '-');
    }
}

// إحصائيات المستخدمين
async function loadUsersStats() {
    try {
        const { data: users } = await supabase
            .from('profiles')
            .select('id, role, banned');
        
        if (users) {
            const total = users.length;
            const active = users.filter(u => !u.banned).length;
            
            updateElement('usersTotal', total);
            updateElement('usersActive', active);
        }
    } catch (err) {
        console.error('Error loading users stats:', err);
        updateElement('usersTotal', '-');
        updateElement('usersActive', '-');
    }
}

// إحصائيات المحظورين
async function loadBannedStats() {
    try {
        const { data: banned } = await supabase
            .from('profiles')
            .select('id, full_name, banned_at')
            .eq('banned', true)
            .order('banned_at', { ascending: false });
        
        if (banned) {
            updateElement('bannedTotal', banned.length);
            
            if (banned.length > 0 && banned[0].banned_at) {
                const lastBanned = new Date(banned[0].banned_at);
                const now = new Date();
                const diffDays = Math.floor((now - lastBanned) / (1000 * 60 * 60 * 24));
                
                let timeText = '';
                if (diffDays === 0) {
                    timeText = 'اليوم';
                } else if (diffDays === 1) {
                    timeText = 'أمس';
                } else if (diffDays < 7) {
                    timeText = `${diffDays} أيام`;
                } else {
                    timeText = lastBanned.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
                }
                
                updateElement('bannedRecent', timeText);
            } else {
                updateElement('bannedRecent', '-');
            }
        }
    } catch (err) {
        console.error('Error loading banned stats:', err);
        updateElement('bannedTotal', '-');
        updateElement('bannedRecent', '-');
    }
}

// إحصائيات النشاطات
async function loadActivityStats() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: activities } = await supabase
            .from('activity_log')
            .select('id, created_at, action')
            .gte('created_at', today.toISOString())
            .order('created_at', { ascending: false });
        
        if (activities) {
            updateElement('activityToday', activities.length);
            
            if (activities.length > 0) {
                const lastActivity = new Date(activities[0].created_at);
                const now = new Date();
                const diffMinutes = Math.floor((now - lastActivity) / (1000 * 60));
                
                let timeText = '';
                if (diffMinutes < 1) {
                    timeText = 'الآن';
                } else if (diffMinutes < 60) {
                    timeText = `${diffMinutes} د`;
                } else {
                    const diffHours = Math.floor(diffMinutes / 60);
                    timeText = `${diffHours} س`;
                }
                
                updateElement('activityRecent', timeText);
            } else {
                updateElement('activityRecent', '-');
            }
        }
    } catch (err) {
        console.error('Error loading activity stats:', err);
        updateElement('activityToday', '-');
        updateElement('activityRecent', '-');
    }
}

// دالة مساعدة لتحديث العناصر
function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// بدء التطبيق
init();
