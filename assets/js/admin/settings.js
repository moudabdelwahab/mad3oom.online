import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';
import { logActivity } from '/activity-service.js';

let user = null;
let currentSettings = {};
let allRoles = [];

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return;

    updateAdminUI(user);
    await loadAllSettings();
    setupEventListeners();
    renderWorkingHours();
}

async function loadAllSettings() {
    try {
        // 1. Load Profile Data
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError) throw profileError;

        document.getElementById('fullName').value = profile.full_name || '';
        document.getElementById('email').value = user.email || '';
        document.getElementById('bio').value = profile.bio || '';
        updateAvatarUI(profile.full_name, profile.avatar_url);

        // 2. Load Platform Control Settings
        const { data: platformSettings } = await supabase
            .from('advanced_settings')
            .select('*')
            .eq('key', 'platform_control')
            .maybeSingle();

        if (platformSettings?.value) {
            const settings = platformSettings.value;
            document.getElementById('sessionTimeout').value = settings.session_timeout || '30';
            document.getElementById('preventMultipleSessions').checked = settings.prevent_multiple_sessions || false;
            document.getElementById('restrictByCountry').checked = settings.restrict_by_country || false;
            document.getElementById('allowedCountries').value = settings.allowed_countries || '';
            document.getElementById('restrictByIP').checked = settings.restrict_by_ip || false;
            document.getElementById('ipRestrictionType').value = settings.ip_restriction_type || 'whitelist';
            document.getElementById('ipList').value = settings.ip_list || '';
            
            if (settings.restrict_by_country) document.getElementById('countryRestrictionSettings').style.display = 'block';
            if (settings.restrict_by_ip) document.getElementById('ipRestrictionSettings').style.display = 'block';
        }

        // 3. Load Communication Control Settings
        const { data: commSettings } = await supabase
            .from('advanced_settings')
            .select('*')
            .eq('key', 'communication_control')
            .maybeSingle();

        if (commSettings?.value) {
            const settings = commSettings.value;
            document.getElementById('maxOpenTickets').value = settings.max_open_tickets || '5';
            document.getElementById('preventDuplicateTickets').checked = settings.prevent_duplicate_tickets !== false;
            document.getElementById('bannedWords').value = settings.banned_words || '';
            document.getElementById('maxMessagesPerMinute').value = settings.max_messages_per_minute || '10';
            document.getElementById('maxMessagesPerHour').value = settings.max_messages_per_hour || '100';
        }

        // 4. Load Emergency Mode Settings
        const { data: emergencySettings } = await supabase
            .from('advanced_settings')
            .select('*')
            .eq('key', 'emergency_mode')
            .maybeSingle();

        if (emergencySettings?.value) {
            const settings = emergencySettings.value;
            document.getElementById('emergencyModeEnabled').checked = settings.enabled || false;
            document.getElementById('disableTicketCreation').checked = settings.disable_ticket_creation || false;
            document.getElementById('disableReplies').checked = settings.disable_replies || false;
            document.getElementById('botOnlyMode').checked = settings.bot_only_mode || false;
            document.getElementById('emergencyMessageCreation').value = settings.message_creation || '';
            document.getElementById('emergencyMessageReplies').value = settings.message_replies || '';
            
            if (settings.enabled) document.getElementById('emergencySettings').style.display = 'block';
        }

        // 5. Load Account Policies
        const { data: accountPolicies } = await supabase
            .from('advanced_settings')
            .select('*')
            .eq('key', 'account_policies')
            .maybeSingle();

        if (accountPolicies?.value) {
            const settings = accountPolicies.value;
            document.getElementById('passwordChangeInterval').value = settings.password_change_interval || '90';
            document.getElementById('passwordStrength').value = settings.password_strength || 'medium';
            document.getElementById('failedLoginAttempts').value = settings.failed_login_attempts || '5';
            document.getElementById('lockoutDuration').value = settings.lockout_duration || '30';
            document.getElementById('force2FAForAdmins').checked = settings.force_2fa_admins || false;
        }

        // 6. Load Working Hours
        const { data: workingHours } = await supabase
            .from('working_hours')
            .select('*')
            .order('day_of_week', { ascending: true });

        if (workingHours) {
            currentSettings.workingHours = workingHours;
        }

        const { data: afterHoursSettings } = await supabase
            .from('advanced_settings')
            .select('*')
            .eq('key', 'after_hours')
            .maybeSingle();

        if (afterHoursSettings?.value) {
            const settings = afterHoursSettings.value;
            document.getElementById('afterHoursAutoReply').value = settings.auto_reply || '';
            document.getElementById('botAfterHours').checked = settings.bot_after_hours || false;
        }

        // 7. Load Bot Settings
        const { data: botSettings } = await supabase.from('bot_settings').select('*').limit(1).maybeSingle();
        if (botSettings) {
            document.getElementById('smartMemoryEnabled').checked = botSettings.smart_memory_enabled || false;
            document.getElementById('botSystemPrompt').value = botSettings.system_prompt || '';
        }

        // 8. Load Ads Settings
        const { data: adsSettings } = await supabase.from('ads_settings').select('*').limit(1).maybeSingle();
        if (adsSettings) {
            document.getElementById('topAdsEnabled').checked = adsSettings.enabled || false;
            document.getElementById('adsContent').value = adsSettings.content || '';
            document.getElementById('adsLink').value = adsSettings.link || '';
        }

        // 9. Load API Keys
        const { data: apiKeys } = await supabase.from('api_keys').select('*').limit(1).maybeSingle();
        if (apiKeys) {
            document.getElementById('openaiKey').value = apiKeys.openai_key || '';
            document.getElementById('telegramBotToken').value = apiKeys.telegram_token || '';
        }

        // 10. Load Rules, Roles & Users
        await loadRules();
        await loadCustomRoles();
        await loadUsers();

    } catch (error) {
        console.error('Error loading settings:', error);
        showAlert('حدث خطأ أثناء تحميل الإعدادات', 'error');
    }
}

async function loadRules() {
    try {
        const { data: rules } = await supabase
            .from('rules_engine')
            .select('*')
            .order('priority', { ascending: false });

        const rulesBody = document.getElementById('rulesBody');
        if (!rulesBody) return;

        if (!rules || rules.length === 0) {
            rulesBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">لا توجد قواعد محددة</td></tr>';
            return;
        }

        rulesBody.innerHTML = rules.map(rule => `
            <tr>
                <td>${rule.name}</td>
                <td>${rule.trigger_event}</td>
                <td>${JSON.stringify(rule.conditions).substring(0, 30)}...</td>
                <td>${JSON.stringify(rule.actions).substring(0, 30)}...</td>
                <td><span class="badge ${rule.is_active ? 'badge-success' : 'badge-warning'}">${rule.is_active ? 'نشط' : 'معطل'}</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm edit-rule-btn" data-rule-id="${rule.id}">تعديل</button>
                    <button class="btn btn-danger btn-sm delete-rule-btn" data-rule-id="${rule.id}">حذف</button>
                </td>
            </tr>
        `).join('');

        document.querySelectorAll('.delete-rule-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteRule(btn.dataset.ruleId));
        });
    } catch (error) {
        console.error('Error loading rules:', error);
    }
}

async function loadCustomRoles() {
    try {
        const { data: roles } = await supabase
            .from('custom_roles')
            .select('*')
            .order('created_at', { ascending: false });

        allRoles = roles || [];
        const rolesBody = document.getElementById('rolesBody');
        const userRoleSelect = document.getElementById('userRole');
        if (!rolesBody) return;

        if (!roles || roles.length === 0) {
            rolesBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">لا توجد أدوار مخصصة</td></tr>';
            return;
        }

        rolesBody.innerHTML = roles.map(role => {
            const permCount = Object.keys(role.permissions || {}).filter(k => role.permissions[k]).length;
            return `
                <tr>
                    <td>${role.name}</td>
                    <td>${role.description || '-'}</td>
                    <td>${permCount}</td>
                    <td>
                        <button class="btn btn-secondary btn-sm edit-role-btn" data-role-id="${role.id}">تعديل</button>
                        <button class="btn btn-danger btn-sm delete-role-btn" data-role-id="${role.id}">حذف</button>
                    </td>
                </tr>
            `;
        }).join('');

        // Update user role select
        if (userRoleSelect) {
            userRoleSelect.innerHTML = '<option value="">اختر دوراً...</option>' + 
                roles.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        }

        document.querySelectorAll('.delete-role-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteRole(btn.dataset.roleId));
        });
        
        document.querySelectorAll('.edit-role-btn').forEach(btn => {
            btn.addEventListener('click', () => editRole(btn.dataset.roleId));
        });
    } catch (error) {
        console.error('Error loading custom roles:', error);
    }
}

async function loadUsers() {
    try {
        const { data: users, error } = await supabase
            .from('profiles')
            .select('*, custom_roles(name)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const usersBody = document.getElementById('usersBody');
        if (!usersBody) return;

        if (!users || users.length === 0) {
            usersBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">لا يوجد مستخدمين</td></tr>';
            return;
        }

        usersBody.innerHTML = users.map(u => `
            <tr>
                <td>${u.full_name || 'بدون اسم'}</td>
                <td>${u.email || '-'}</td>
                <td><span class="badge badge-success">${u.custom_roles?.name || u.role || 'مستخدم'}</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm edit-user-btn" data-user-id="${u.id}">تعديل</button>
                    <button class="btn btn-danger btn-sm delete-user-btn" data-user-id="${u.id}">حذف</button>
                </td>
            </tr>
        `).join('');

        document.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.addEventListener('click', () => editUser(btn.dataset.userId));
        });
        
        document.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteUser(btn.dataset.userId));
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            document.querySelectorAll('.settings-card').forEach(card => {
                card.style.display = card.id === targetId ? 'block' : 'none';
            });
        });
    });

    // Save Buttons
    document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
    document.getElementById('savePlatformBtn').addEventListener('click', () => {
        const settings = {
            session_timeout: document.getElementById('sessionTimeout').value,
            prevent_multiple_sessions: document.getElementById('preventMultipleSessions').checked,
            restrict_by_country: document.getElementById('restrictByCountry').checked,
            allowed_countries: document.getElementById('allowedCountries').value,
            restrict_by_ip: document.getElementById('restrictByIP').checked,
            ip_restriction_type: document.getElementById('ipRestrictionType').value,
            ip_list: document.getElementById('ipList').value
        };
        saveAdvancedSetting('platform_control', settings);
    });

    document.getElementById('saveCommunicationBtn').addEventListener('click', () => {
        const settings = {
            max_open_tickets: document.getElementById('maxOpenTickets').value,
            prevent_duplicate_tickets: document.getElementById('preventDuplicateTickets').checked,
            banned_words: document.getElementById('bannedWords').value,
            max_messages_per_minute: document.getElementById('maxMessagesPerMinute').value,
            max_messages_per_hour: document.getElementById('maxMessagesPerHour').value
        };
        saveAdvancedSetting('communication_control', settings);
    });

    document.getElementById('saveEmergencyBtn').addEventListener('click', () => {
        const settings = {
            enabled: document.getElementById('emergencyModeEnabled').checked,
            disable_ticket_creation: document.getElementById('disableTicketCreation').checked,
            disable_replies: document.getElementById('disableReplies').checked,
            bot_only_mode: document.getElementById('botOnlyMode').checked,
            message_creation: document.getElementById('emergencyMessageCreation').value,
            message_replies: document.getElementById('emergencyMessageReplies').value
        };
        saveAdvancedSetting('emergency_mode', settings);
    });

    document.getElementById('saveBotBtn').addEventListener('click', saveBotSettings);
    document.getElementById('saveAdsBtn').addEventListener('click', saveAdsSettings);
    document.getElementById('saveApiKeysBtn').addEventListener('click', saveApiKeys);

    // Roles & Users
    document.getElementById('addRoleBtn').addEventListener('click', () => {
        document.getElementById('roleFormModal').style.display = 'block';
        document.getElementById('roleModalTitle').textContent = 'إضافة دور جديد';
        document.getElementById('editRoleId').value = '';
        document.getElementById('roleName').value = '';
        document.getElementById('roleDescription').value = '';
        document.querySelectorAll('[id^="perm-"]').forEach(cb => cb.checked = false);
    });

    document.getElementById('cancelRoleBtn').addEventListener('click', () => {
        document.getElementById('roleFormModal').style.display = 'none';
    });

    document.getElementById('saveRoleBtn').addEventListener('click', saveRole);

    document.getElementById('addUserBtn').addEventListener('click', () => {
        document.getElementById('userFormModal').style.display = 'block';
        document.getElementById('userModalTitle').textContent = 'إضافة مستخدم جديد';
        document.getElementById('editUserId').value = '';
        document.getElementById('userFullName').value = '';
        document.getElementById('userEmail').value = '';
        document.getElementById('userPassword').value = '';
        document.getElementById('userRole').value = '';
    });

    document.getElementById('cancelUserBtn').addEventListener('click', () => {
        document.getElementById('userFormModal').style.display = 'none';
    });

    document.getElementById('saveUserBtn').addEventListener('click', saveUser);

    // Visibility Toggles
    document.getElementById('restrictByCountry').addEventListener('change', (e) => {
        document.getElementById('countryRestrictionSettings').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('restrictByIP').addEventListener('change', (e) => {
        document.getElementById('ipRestrictionSettings').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('emergencyModeEnabled').addEventListener('change', (e) => {
        document.getElementById('emergencySettings').style.display = e.target.checked ? 'block' : 'none';
    });
}

async function saveProfile() {
    const btn = document.getElementById('saveProfileBtn');
    setLoading(btn, true);
    try {
        const updates = {
            full_name: document.getElementById('fullName').value,
            bio: document.getElementById('bio').value,
            updated_at: new Date()
        };

        const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
        if (error) throw error;
        showAlert('تم تحديث الملف الشخصي بنجاح', 'success');
    } catch (error) {
        showAlert('خطأ في التحديث: ' + error.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function saveAdvancedSetting(key, value) {
    try {
        const { data: existing } = await supabase.from('advanced_settings').select('id').eq('key', key).maybeSingle();
        let error;
        if (existing) {
            ({ error } = await supabase.from('advanced_settings').update({ value }).eq('key', key));
        } else {
            ({ error } = await supabase.from('advanced_settings').insert({ key, value }));
        }
        if (error) throw error;
        showAlert('تم حفظ الإعدادات بنجاح', 'success');
    } catch (error) {
        showAlert('خطأ في الحفظ: ' + error.message, 'error');
    }
}

async function saveBotSettings() {
    const btn = document.getElementById('saveBotBtn');
    setLoading(btn, true);
    try {
        const updates = {
            smart_memory_enabled: document.getElementById('smartMemoryEnabled').checked,
            system_prompt: document.getElementById('botSystemPrompt').value,
            updated_at: new Date()
        };
        const { data: existing } = await supabase.from('bot_settings').select('id').limit(1).maybeSingle();
        let error;
        if (existing) {
            ({ error } = await supabase.from('bot_settings').update(updates).eq('id', existing.id));
        } else {
            ({ error } = await supabase.from('bot_settings').insert(updates));
        }
        if (error) throw error;
        showAlert('تم حفظ إعدادات البوت بنجاح', 'success');
    } catch (error) {
        showAlert('خطأ في الحفظ: ' + error.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function saveAdsSettings() {
    const btn = document.getElementById('saveAdsBtn');
    setLoading(btn, true);
    try {
        const updates = {
            enabled: document.getElementById('topAdsEnabled').checked,
            content: document.getElementById('adsContent').value,
            link: document.getElementById('adsLink').value,
            updated_at: new Date()
        };
        const { data: existing } = await supabase.from('ads_settings').select('id').limit(1).maybeSingle();
        let error;
        if (existing) {
            ({ error } = await supabase.from('ads_settings').update(updates).eq('id', existing.id));
        } else {
            ({ error } = await supabase.from('ads_settings').insert(updates));
        }
        if (error) throw error;
        showAlert('تم حفظ إعدادات الإعلانات بنجاح', 'success');
    } catch (error) {
        showAlert('خطأ في الحفظ: ' + error.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function saveApiKeys() {
    const btn = document.getElementById('saveApiKeysBtn');
    setLoading(btn, true);
    try {
        const updates = {
            openai_key: document.getElementById('openaiKey').value,
            telegram_token: document.getElementById('telegramBotToken').value,
            updated_at: new Date()
        };
        const { data: existing } = await supabase.from('api_keys').select('id').limit(1).maybeSingle();
        let error;
        if (existing) {
            ({ error } = await supabase.from('api_keys').update(updates).eq('id', existing.id));
        } else {
            ({ error } = await supabase.from('api_keys').insert(updates));
        }
        if (error) throw error;
        showAlert('تم حفظ مفاتيح API بنجاح', 'success');
    } catch (error) {
        showAlert('خطأ في الحفظ: ' + error.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function saveRole() {
    const roleId = document.getElementById('editRoleId').value;
    const role = {
        name: document.getElementById('roleName').value,
        description: document.getElementById('roleDescription').value,
        permissions: {
            view_tickets: document.getElementById('perm-view-tickets').checked,
            reply: document.getElementById('perm-reply').checked,
            delete: document.getElementById('perm-delete').checked,
            export: document.getElementById('perm-export').checked,
            settings: document.getElementById('perm-settings').checked,
            api: document.getElementById('perm-api').checked
        }
    };

    try {
        let error;
        if (roleId) {
            ({ error } = await supabase.from('custom_roles').update(role).eq('id', roleId));
        } else {
            ({ error } = await supabase.from('custom_roles').insert(role));
        }
        if (error) throw error;
        showAlert('تم حفظ الدور بنجاح', 'success');
        document.getElementById('roleFormModal').style.display = 'none';
        await loadCustomRoles();
    } catch (error) {
        showAlert('خطأ في حفظ الدور: ' + error.message, 'error');
    }
}

async function editRole(id) {
    const role = allRoles.find(r => r.id === id);
    if (!role) return;

    document.getElementById('roleFormModal').style.display = 'block';
    document.getElementById('roleModalTitle').textContent = 'تعديل الدور';
    document.getElementById('editRoleId').value = role.id;
    document.getElementById('roleName').value = role.name;
    document.getElementById('roleDescription').value = role.description || '';
    
    const perms = role.permissions || {};
    document.getElementById('perm-view-tickets').checked = perms.view_tickets || false;
    document.getElementById('perm-reply').checked = perms.reply || false;
    document.getElementById('perm-delete').checked = perms.delete || false;
    document.getElementById('perm-export').checked = perms.export || false;
    document.getElementById('perm-settings').checked = perms.settings || false;
    document.getElementById('perm-api').checked = perms.api || false;
}

async function deleteRole(roleId) {
    if (!confirm('هل أنت متأكد من حذف هذا الدور؟')) return;
    try {
        const { error } = await supabase.from('custom_roles').delete().eq('id', roleId);
        if (error) throw error;
        showAlert('تم حذف الدور بنجاح', 'success');
        await loadCustomRoles();
    } catch (error) {
        showAlert('خطأ في حذف الدور: ' + error.message, 'error');
    }
}

async function saveUser() {
    const userId = document.getElementById('editUserId').value;
    const fullName = document.getElementById('userFullName').value;
    const email = document.getElementById('userEmail').value;
    const password = document.getElementById('userPassword').value;
    const roleId = document.getElementById('userRole').value;

    try {
        if (userId) {
            // Update existing user profile
            const { error } = await supabase.from('profiles').update({
                full_name: fullName,
                custom_role_id: roleId || null
            }).eq('id', userId);
            if (error) throw error;
        } else {
            // Create new user via Supabase Auth
            const { data, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { full_name: fullName } }
            });
            if (authError) throw authError;
            
            // Profile is usually created via trigger, but we update the role
            if (data.user && roleId) {
                await supabase.from('profiles').update({ custom_role_id: roleId }).eq('id', data.user.id);
            }
        }
        showAlert('تم حفظ المستخدم بنجاح', 'success');
        document.getElementById('userFormModal').style.display = 'none';
        await loadUsers();
    } catch (error) {
        showAlert('خطأ في حفظ المستخدم: ' + error.message, 'error');
    }
}

async function editUser(id) {
    try {
        const { data: u, error } = await supabase.from('profiles').select('*').eq('id', id).single();
        if (error) throw error;

        document.getElementById('userFormModal').style.display = 'block';
        document.getElementById('userModalTitle').textContent = 'تعديل المستخدم';
        document.getElementById('editUserId').value = u.id;
        document.getElementById('userFullName').value = u.full_name || '';
        document.getElementById('userEmail').value = u.email || '';
        document.getElementById('userEmail').readOnly = true;
        document.getElementById('userPassword').placeholder = 'اتركها فارغة للحفاظ على الحالية';
        document.getElementById('userRole').value = u.custom_role_id || '';
    } catch (error) {
        showAlert('خطأ في تحميل بيانات المستخدم', 'error');
    }
}

async function deleteUser(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟ سيتم حذف ملفه الشخصي فقط، لحذف الحساب نهائياً يجب استخدام لوحة تحكم Supabase.')) return;
    try {
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) throw error;
        showAlert('تم حذف ملف المستخدم بنجاح', 'success');
        await loadUsers();
    } catch (error) {
        showAlert('خطأ في حذف المستخدم: ' + error.message, 'error');
    }
}

function updateAvatarUI(name, url) {
    const preview = document.getElementById('avatarPreview');
    if (url) {
        preview.innerHTML = `<img src="${url}" alt="Profile">`;
    } else {
        const initial = name ? name.charAt(0).toUpperCase() : 'A';
        preview.innerHTML = initial;
    }
}

function setLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.textContent;
        btn.textContent = 'جاري الحفظ...';
    } else {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText;
    }
}

function showAlert(message, type) {
    const alert = document.getElementById('settingsAlert');
    alert.textContent = message;
    alert.className = `alert alert-${type === 'info' ? 'success' : type}`;
    alert.style.display = 'block';
    if (type !== 'info') {
        setTimeout(() => { alert.style.display = 'none'; }, 5000);
    }
}

function renderWorkingHours() {
    const container = document.getElementById('workingHoursContainer');
    if (!container) return;
    // Logic to render working hours based on currentSettings.workingHours
}

init();
