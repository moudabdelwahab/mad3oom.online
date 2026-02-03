import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';

let user = null;

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return;

    updateAdminUI(user);
    
    // Initial fetch
    fetchAllStats();
    
    // Setup Realtime Subscriptions
    setupRealtimeSubscriptions();
}

async function fetchAllStats() {
    console.log('[Stats] Fetching all statistics...');
    
    // 1. Users & Security
    fetchUserStats();
    
    // 2. Tickets & Support
    fetchTicketStats();
    
    // 3. Chat & API
    fetchChatStats();
    
    // 4. Rewards & Activity
    fetchRewardStats();
}

async function fetchUserStats() {
    try {
        // Total Users
        const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        updateValue('totalUsers', totalUsers);

        // Banned Users
        const { count: bannedUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'banned');
        updateValue('bannedUsers', bannedUsers);

        // Users with 2FA enabled
        const { count: users2FA } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('two_factor_enabled', true);
        updateValue('users2FA', users2FA);

        // Trusted Devices
        const { count: trustedDevices } = await supabase.from('trusted_devices').select('*', { count: 'exact', head: true });
        updateValue('trustedDevices', trustedDevices);
    } catch (e) { console.error('Error fetching user stats:', e); }
}

async function fetchTicketStats() {
    try {
        // Total Tickets
        const { count: totalTickets } = await supabase.from('tickets').select('*', { count: 'exact', head: true });
        updateValue('totalTickets', totalTickets);

        // Open Tickets
        const { count: openTickets } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'open');
        updateValue('openTickets', openTickets);

        // Resolved Tickets
        const { count: resolvedTickets } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'resolved');
        updateValue('resolvedTickets', resolvedTickets);

        // Total Replies
        const { count: totalReplies } = await supabase.from('ticket_replies').select('*', { count: 'exact', head: true });
        updateValue('totalReplies', totalReplies);
    } catch (e) { console.error('Error fetching ticket stats:', e); }
}

async function fetchChatStats() {
    try {
        // Chat Sessions
        const { count: chatSessions } = await supabase.from('chat_sessions').select('*', { count: 'exact', head: true });
        updateValue('chatSessions', chatSessions);

        // Chat Messages
        const { count: chatMessages } = await supabase.from('chat_messages').select('*', { count: 'exact', head: true });
        updateValue('chatMessages', chatMessages);

        // Bot Replies
        const { count: botReplies } = await supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('is_bot_reply', true);
        updateValue('botReplies', botReplies);

        // Active API Keys
        const { count: activeApiKeys } = await supabase.from('bot_api_keys').select('*', { count: 'exact', head: true }).eq('status', 'active');
        updateValue('activeApiKeys', activeApiKeys);
    } catch (e) { console.error('Error fetching chat stats:', e); }
}

async function fetchRewardStats() {
    try {
        // Total Points Distributed
        const { data: wallets } = await supabase.from('user_wallets').select('total_points');
        const totalPoints = wallets?.reduce((sum, w) => sum + (w.total_points || 0), 0) || 0;
        updateValue('totalPoints', totalPoints.toLocaleString('ar-EG'));

        // Approved Reports
        const { count: approvedReports } = await supabase.from('user_reports').select('*', { count: 'exact', head: true }).eq('status', 'approved');
        updateValue('approvedReports', approvedReports);

        // PRO Members
        const { count: proMembers } = await supabase.from('user_wallets').select('*', { count: 'exact', head: true }).eq('is_pro', true);
        updateValue('proMembers', proMembers);

        // Activity Logs
        const { count: activityLogs } = await supabase.from('activity_logs').select('*', { count: 'exact', head: true });
        updateValue('activityLogs', activityLogs);
    } catch (e) { console.error('Error fetching reward stats:', e); }
}

function updateValue(id, value) {
    const el = document.getElementById(id);
    if (el) {
        // Simple animation effect
        const startValue = parseInt(el.textContent.replace(/,/g, '')) || 0;
        const endValue = typeof value === 'string' ? parseInt(value.replace(/,/g, '')) : value;
        
        if (isNaN(startValue) || isNaN(endValue) || startValue === endValue) {
            el.textContent = value;
            return;
        }

        el.textContent = value;
        el.style.transition = 'color 0.3s';
        el.style.color = '#10b981';
        setTimeout(() => {
            el.style.color = '';
        }, 1000);
    }
}

function setupRealtimeSubscriptions() {
    console.log('[Stats] Setting up realtime subscriptions...');
    
    const tables = [
        'profiles', 'tickets', 'ticket_replies', 'chat_sessions', 
        'chat_messages', 'user_wallets', 'user_reports', 'activity_logs',
        'bot_api_keys', 'trusted_devices'
    ];

    tables.forEach(table => {
        supabase
            .channel(`stats-${table}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: table }, (payload) => {
                console.log(`[Stats] Change detected in ${table}:`, payload.event);
                
                // Refresh relevant stats based on table
                if (table === 'profiles' || table === 'trusted_devices') fetchUserStats();
                if (table === 'tickets' || table === 'ticket_replies') fetchTicketStats();
                if (table === 'chat_sessions' || table === 'chat_messages' || table === 'bot_api_keys') fetchChatStats();
                if (table === 'user_wallets' || table === 'user_reports' || table === 'activity_logs') fetchRewardStats();
            })
            .subscribe();
    });
}

init();
