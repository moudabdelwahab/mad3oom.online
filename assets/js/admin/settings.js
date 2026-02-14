import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';
import { logActivity } from '/activity-service.js';

let user = null;
let currentSettings = {};

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
            
            // Toggle visibility
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
            if (document.getElementById('geminiKey')) {
                document.getElementById('geminiKey').value = apiKeys.gemini_key || '';
            }
        }

        // 10. Load Rules & Roles
        await loadRules();
        await loadCustomRoles();

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

        const rolesBody = document.getElementById('rolesBody');
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

        document.querySelectorAll('.delete-role-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteRole(btn.dataset.roleId));
        });
    } catch (error) {
        console.error('Error loading custom roles:', error);
    }
}

function renderWorkingHours() {
    const container = document.getElementById('workingHoursContainer');
    if (!container) return;

    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    
    container.innerHTML = days.map((day, index) => `
        <div style="background: var(--color-muted); padding: 1.5rem; border-radius: 1rem; margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                <h4 style="margin: 0;">${day}</h4>
                <label class="switch">
                    <input type="checkbox" class="day-working" data-day="${index}" checked>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="time-input-group">
                <input type="time" class="form-control day-start-time" data-day="${index}" value="09:00" style="width: 150px;">
                <span>إلى</span>
                <input type="time" class="form-control day-end-time" data-day="${index}" value="17:00" style="width: 150px;">
            </div>
        </div>
    `).join('');

    if (currentSettings.workingHours) {
        currentSettings.workingHours.forEach(wh => {
            const dayCheckbox = document.querySelector(`.day-working[data-day="${wh.day_of_week}"]`);
            if (dayCheckbox) dayCheckbox.checked = wh.is_working_day;
            if (wh.start_time) {
                const startInput = document.querySelector(`.day-start-time[data-day="${wh.day_of_week}"]`);
                if (startInput) startInput.value = wh.start_time;
            }
            if (wh.end_time) {
                const endInput = document.querySelector(`.day-end-time[data-day="${wh.day_of_week}"]`);
                if (endInput) endInput.value = wh.end_time;
            }
        });
    }
}

function setupEventListeners() {
    // Profile Update
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('saveProfileBtn');
        const fullName = document.getElementById('fullName').value;
        const bio = document.getElementById('bio').value;

        setLoading(btn, true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ full_name: fullName, bio: bio })
                .eq('id', user.id);

            if (error) throw error;
            showAlert('تم تحديث الملف الشخصي بنجاح', 'success');
            updateAdminUI({ ...user, full_name: fullName });
            await logActivity('admin_updated_profile', { user_id: user.id });
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            setLoading(btn, false);
        }
    });

    // Platform Control
    document.getElementById('savePlatformBtn')?.addEventListener('click', async () => {
        const settings = {
            session_timeout: document.getElementById('sessionTimeout').value,
            prevent_multiple_sessions: document.getElementById('preventMultipleSessions').checked,
            restrict_by_country: document.getElementById('restrictByCountry').checked,
            allowed_countries: document.getElementById('allowedCountries').value,
            restrict_by_ip: document.getElementById('restrictByIP').checked,
            ip_restriction_type: document.getElementById('ipRestrictionType').value,
            ip_list: document.getElementById('ipList').value
        };
        await saveAdvancedSetting('platform_control', settings);
        await logActivity('admin_updated_settings', { section: 'platform_control' });
    });

    // Communication Control
    document.getElementById('saveCommunicationBtn')?.addEventListener('click', async () => {
        const settings = {
            max_open_tickets: parseInt(document.getElementById('maxOpenTickets').value),
            prevent_duplicate_tickets: document.getElementById('preventDuplicateTickets').checked,
            banned_words: document.getElementById('bannedWords').value,
            max_messages_per_minute: parseInt(document.getElementById('maxMessagesPerMinute').value),
            max_messages_per_hour: parseInt(document.getElementById('maxMessagesPerHour').value)
        };
        await saveAdvancedSetting('communication_control', settings);
        await logActivity('admin_updated_settings', { section: 'communication_control' });
    });

    // Emergency Mode
    document.getElementById('saveEmergencyBtn')?.addEventListener('click', async () => {
        const settings = {
            enabled: document.getElementById('emergencyModeEnabled').checked,
            disable_ticket_creation: document.getElementById('disableTicketCreation').checked,
            disable_replies: document.getElementById('disableReplies').checked,
            bot_only_mode: document.getElementById('botOnlyMode').checked,
            message_creation: document.getElementById('emergencyMessageCreation').value,
            message_replies: document.getElementById('emergencyMessageReplies').value
        };
        await saveAdvancedSetting('emergency_mode', settings);
        await logActivity('admin_updated_settings', { section: 'emergency_mode' });
    });

    // Account Policies
    document.getElementById('saveAccountPoliciesBtn')?.addEventListener('click', async () => {
        const settings = {
            password_change_interval: parseInt(document.getElementById('passwordChangeInterval').value),
            password_strength: document.getElementById('passwordStrength').value,
            failed_login_attempts: parseInt(document.getElementById('failedLoginAttempts').value),
            lockout_duration: parseInt(document.getElementById('lockoutDuration').value),
            force_2fa_admins: document.getElementById('force2FAForAdmins').checked
        };
        await saveAdvancedSetting('account_policies', settings);
        await logActivity('admin_updated_settings', { section: 'account_policies' });
    });

    // Working Hours
    document.getElementById('saveWorkingHoursBtn')?.addEventListener('click', async () => {
        try {
            const workingHoursData = [];
            for (let i = 0; i < 7; i++) {
                const isWorking = document.querySelector(`.day-working[data-day="${i}"]`)?.checked || false;
                const startTime = document.querySelector(`.day-start-time[data-day="${i}"]`)?.value || '09:00';
                const endTime = document.querySelector(`.day-end-time[data-day="${i}"]`)?.value || '17:00';
                workingHoursData.push({
                    day_of_week: i,
                    is_working_day: isWorking,
                    start_time: isWorking ? startTime : null,
                    end_time: isWorking ? endTime : null
                });
            }
            await supabase.from('working_hours').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            const { error } = await supabase.from('working_hours').insert(workingHoursData);
            if (error) throw error;

            const afterHours = {
                auto_reply: document.getElementById('afterHoursAutoReply').value,
                bot_after_hours: document.getElementById('botAfterHours').checked
            };
            await saveAdvancedSetting('after_hours', afterHours);
            
            showAlert('تم حفظ ساعات العمل بنجاح', 'success');
            await logActivity('admin_updated_settings', { section: 'working_hours' });
        } catch (error) {
            showAlert('خطأ في حفظ ساعات العمل: ' + error.message, 'error');
        }
    });

    // Bot Settings
    document.getElementById('saveBotBtn')?.addEventListener('click', async () => {
        const settings = {
            smart_memory_enabled: document.getElementById('smartMemoryEnabled').checked,
            system_prompt: document.getElementById('botSystemPrompt').value
        };
        try {
            const { data } = await supabase.from('bot_settings').select('id').limit(1).maybeSingle();
            let error;
            if (data) {
                ({ error } = await supabase.from('bot_settings').update(settings).eq('id', data.id));
            } else {
                ({ error } = await supabase.from('bot_settings').insert(settings));
            }
            if (error) throw error;
            showAlert('تم تحديث إعدادات ذكاء البوت', 'success');
            await logActivity('admin_updated_settings', { section: 'bot' });
        } catch (error) {
            showAlert(error.message, 'error');
        }
    });

    // Ads Settings
    document.getElementById('saveAdsBtn')?.addEventListener('click', async () => {
        const settings = {
            enabled: document.getElementById('topAdsEnabled').checked,
            content: document.getElementById('adsContent').value,
            link: document.getElementById('adsLink').value
        };
        try {
            const { data } = await supabase.from('ads_settings').select('id').limit(1).maybeSingle();
            let error;
            if (data) {
                ({ error } = await supabase.from('ads_settings').update(settings).eq('id', data.id));
            } else {
                ({ error } = await supabase.from('ads_settings').insert(settings));
            }
            if (error) throw error;
            showAlert('تم تحديث إعدادات الإعلانات بنجاح', 'success');
            await logActivity('admin_updated_settings', { section: 'ads' });
        } catch (error) {
            showAlert(error.message, 'error');
        }
    });

    // API Keys
    document.getElementById('saveApiBtn')?.addEventListener('click', async () => {
        const settings = {
            openai_key: document.getElementById('openaiKey').value,
            telegram_token: document.getElementById('telegramBotToken').value,
            gemini_key: document.getElementById('geminiKey')?.value || ''
        };
        try {
            const { data } = await supabase.from('api_keys').select('id').limit(1).maybeSingle();
            let error;
            if (data) {
                ({ error } = await supabase.from('api_keys').update(settings).eq('id', data.id));
            } else {
                ({ error } = await supabase.from('api_keys').insert(settings));
            }
            if (error) throw error;
            showAlert('تم حفظ مفاتيح التكامل بنجاح', 'success');
            await logActivity('admin_updated_settings', { section: 'api' });
        } catch (error) {
            showAlert(error.message, 'error');
        }
    });

    // Rules & Roles Modals
    document.getElementById('addRuleBtn')?.addEventListener('click', () => {
        document.getElementById('ruleFormModal').style.display = 'block';
    });
    document.getElementById('cancelRuleBtn')?.addEventListener('click', () => {
        document.getElementById('ruleFormModal').style.display = 'none';
    });
    document.getElementById('saveRuleBtn')?.addEventListener('click', saveRule);

    document.getElementById('addRoleBtn')?.addEventListener('click', () => {
        document.getElementById('roleFormModal').style.display = 'block';
    });
    document.getElementById('cancelRoleBtn')?.addEventListener('click', () => {
        document.getElementById('roleFormModal').style.display = 'none';
    });
    document.getElementById('saveRoleBtn')?.addEventListener('click', saveRole);

    // Avatar Upload
    document.getElementById('avatarInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            showAlert('جاري رفع الصورة...', 'info');
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}-${Math.random()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
            await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
            updateAvatarUI(user.full_name, publicUrl);
            showAlert('تم تحديث صورة الحساب بنجاح', 'success');
        } catch (error) {
            showAlert(error.message, 'error');
        }
    });
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

async function saveRule() {
    try {
        const rule = {
            name: document.getElementById('ruleName').value,
            trigger_event: document.getElementById('ruleTrigger').value,
            conditions: [{ type: 'custom', value: document.getElementById('ruleCondition').value }],
            actions: [{ type: document.getElementById('ruleAction').value }],
            is_active: true
        };
        const { error } = await supabase.from('rules_engine').insert(rule);
        if (error) throw error;
        showAlert('تم إضافة القاعدة بنجاح', 'success');
        document.getElementById('ruleFormModal').style.display = 'none';
        await loadRules();
    } catch (error) {
        showAlert('خطأ في إضافة القاعدة: ' + error.message, 'error');
    }
}

async function deleteRule(ruleId) {
    if (!confirm('هل أنت متأكد من حذف هذه القاعدة؟')) return;
    try {
        const { error } = await supabase.from('rules_engine').delete().eq('id', ruleId);
        if (error) throw error;
        showAlert('تم حذف القاعدة بنجاح', 'success');
        await loadRules();
    } catch (error) {
        showAlert('خطأ في حذف القاعدة: ' + error.message, 'error');
    }
}

async function saveRole() {
    try {
        const permissions = {
            view_tickets: document.getElementById('perm-view-tickets').checked,
            reply: document.getElementById('perm-reply').checked,
            delete: document.getElementById('perm-delete').checked,
            export: document.getElementById('perm-export').checked,
            settings: document.getElementById('perm-settings').checked,
            api: document.getElementById('perm-api').checked
        };
        const role = {
            name: document.getElementById('roleName').value,
            description: document.getElementById('roleDescription').value,
            permissions: permissions
        };
        const { error } = await supabase.from('custom_roles').insert(role);
        if (error) throw error;
        showAlert('تم إضافة الدور بنجاح', 'success');
        document.getElementById('roleFormModal').style.display = 'none';
        await loadCustomRoles();
    } catch (error) {
        showAlert('خطأ في إضافة الدور: ' + error.message, 'error');
    }
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

init();
