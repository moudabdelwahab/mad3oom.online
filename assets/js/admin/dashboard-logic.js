import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';

let user = null;
let subscriptions = [];

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return; 
    
    updateAdminUI(user);
    
    // تحميل جميع الإحصائيات
    await loadAllStats();
    
    // إعداد التحديثات الفورية
    setupRealtimeSubscriptions();
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
        const { data: tickets, error } = await supabase
            .from('tickets')
            .select('status');
        
        if (error) {
            console.error('Error loading tickets:', error);
            return;
        }
        
        if (tickets) {
            const open = tickets.filter(t => t.status === 'open').length;
            const inProgress = tickets.filter(t => t.status === 'in_progress').length;
            const resolved = tickets.filter(t => t.status === 'resolved').length;
            
            updateElement('ticketsOpen', open);
            updateElement('ticketsInProgress', inProgress);
            updateElement('ticketsResolved', resolved);
            updateElement('ticketsClosed', resolved); // المغلقة = المحلولة
        }
    } catch (err) {
        console.error('Error loading tickets stats:', err);
        updateElement('ticketsOpen', '0');
        updateElement('ticketsInProgress', '0');
        updateElement('ticketsResolved', '0');
        updateElement('ticketsClosed', '0');
    }
}

// إحصائيات المحادثات
async function loadChatStats() {
    try {
        const { data: sessions, error } = await supabase
            .from('chat_sessions')
            .select('status');
        
        if (error) {
            console.error('Error loading chat sessions:', error);
            return;
        }
        
        if (sessions) {
            const active = sessions.filter(s => s.status === 'active').length;
            const closed = sessions.filter(s => s.status === 'closed').length;
            
            updateElement('chatActive', active);
            updateElement('chatClosed', closed);
        }
    } catch (err) {
        console.error('Error loading chat stats:', err);
        updateElement('chatActive', '0');
        updateElement('chatClosed', '0');
    }
}

// إحصائيات المستخدمين
async function loadUsersStats() {
    try {
        const { data: users, error } = await supabase
            .from('profiles')
            .select('id, ban_status');
        
        if (error) {
            console.error('Error loading users:', error);
            return;
        }
        
        if (users) {
            const total = users.length;
            const active = users.filter(u => !u.ban_status || u.ban_status === 'none').length;
            
            updateElement('usersTotal', total);
            updateElement('usersActive', active);
        }
    } catch (err) {
        console.error('Error loading users stats:', err);
        updateElement('usersTotal', '0');
        updateElement('usersActive', '0');
    }
}

// إحصائيات المحظورين
async function loadBannedStats() {
    try {
        const { data: banned, error } = await supabase
            .from('profiles')
            .select('id, full_name, ban_until')
            .not('ban_status', 'eq', 'none')
            .order('ban_until', { ascending: false });
        
        if (error) {
            console.error('Error loading banned users:', error);
            return;
        }
        
        if (banned) {
            updateElement('bannedTotal', banned.length);
            
            if (banned.length > 0 && banned[0].ban_until) {
                const lastBanned = new Date(banned[0].ban_until);
                const now = new Date();
                const diffDays = Math.floor((now - lastBanned) / (1000 * 60 * 60 * 24));
                
                let timeText = '';
                if (diffDays === 0) {
                    timeText = 'اليوم';
                } else if (diffDays === 1) {
                    timeText = 'أمس';
                } else if (diffDays < 7) {
                    timeText = `${diffDays} أيام`;
                } else if (diffDays < 30) {
                    const weeks = Math.floor(diffDays / 7);
                    timeText = `${weeks} ${weeks === 1 ? 'أسبوع' : 'أسابيع'}`;
                } else {
                    timeText = lastBanned.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
                }
                
                updateElement('bannedRecent', timeText);
            } else {
                updateElement('bannedRecent', '-');
            }
        } else {
            updateElement('bannedTotal', '0');
            updateElement('bannedRecent', '-');
        }
    } catch (err) {
        console.error('Error loading banned stats:', err);
        updateElement('bannedTotal', '0');
        updateElement('bannedRecent', '-');
    }
}

// إحصائيات النشاطات
async function loadActivityStats() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: activities, error } = await supabase
            .from('activity_logs')
            .select('id, created_at, action')
            .gte('created_at', today.toISOString())
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error loading activities:', error);
            return;
        }
        
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
                    if (diffHours < 24) {
                        timeText = `${diffHours} س`;
                    } else {
                        timeText = 'أمس';
                    }
                }
                
                updateElement('activityRecent', timeText);
            } else {
                updateElement('activityRecent', '-');
            }
        } else {
            updateElement('activityToday', '0');
            updateElement('activityRecent', '-');
        }
    } catch (err) {
        console.error('Error loading activity stats:', err);
        updateElement('activityToday', '0');
        updateElement('activityRecent', '-');
    }
}

// إعداد التحديثات الفورية (Realtime)
function setupRealtimeSubscriptions() {
    // الاشتراك في تحديثات التذاكر
    const ticketsSubscription = supabase
        .channel('tickets-changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'tickets' }, 
            () => {
                console.log('Tickets updated - reloading stats');
                loadTicketsStats();
            }
        )
        .subscribe();
    
    subscriptions.push(ticketsSubscription);
    
    // الاشتراك في تحديثات المحادثات
    const chatSubscription = supabase
        .channel('chat-sessions-changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'chat_sessions' }, 
            () => {
                console.log('Chat sessions updated - reloading stats');
                loadChatStats();
            }
        )
        .subscribe();
    
    subscriptions.push(chatSubscription);
    
    // الاشتراك في تحديثات المستخدمين
    const usersSubscription = supabase
        .channel('profiles-changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'profiles' }, 
            () => {
                console.log('Profiles updated - reloading stats');
                loadUsersStats();
                loadBannedStats();
            }
        )
        .subscribe();
    
    subscriptions.push(usersSubscription);
    
    // الاشتراك في تحديثات النشاطات
    const activitySubscription = supabase
        .channel('activity-logs-changes')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'activity_logs' }, 
            () => {
                console.log('Activity log updated - reloading stats');
                loadActivityStats();
            }
        )
        .subscribe();
    
    subscriptions.push(activitySubscription);
    
    console.log('Realtime subscriptions setup complete');
}

// دالة مساعدة لتحديث العناصر
function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        // إضافة تأثير بصري عند التحديث
        element.style.transition = 'all 0.3s ease';
        element.style.transform = 'scale(1.1)';
        element.textContent = value;
        
        setTimeout(() => {
            element.style.transform = 'scale(1)';
        }, 300);
    }
}

// تنظيف الاشتراكات عند إغلاق الصفحة
window.addEventListener('beforeunload', () => {
    subscriptions.forEach(sub => {
        supabase.removeChannel(sub);
    });
});

// بدء التطبيق
init();
