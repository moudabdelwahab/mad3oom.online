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
    await loadAllAdvancedSettings();
    setupEventListeners();
    renderWorkingHours();
}

async function loadAllAdvancedSettings() {
    try {
        // Load Platform Control Settings
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
        }

        // Load Communication Control Settings
        const { data: commSettings } = await supabase
            .from('advanced_settings')
            .select('*')
            .eq('key', 'communication_control')
            .maybeSingle();

        if (commSettings?.value) {
            const settings = commSettings.value;
            document.getElementById('maxOpenTickets').value = settings.max_open_tickets || '5';
            document.getElementById('preventDuplicateTickets').checked = settings.prevent_duplicate_tickets !== false;
            document.getElementById('duplicateCheckWindow').value = settings.duplicate_check_window || '30';
            document.getElementById('bannedWords').value = settings.banned_words || '';
            document.getElementById('maxMessagesPerMinute').value = settings.max_messages_per_minute || '10';
            document.getElementById('maxMessagesPerHour').value = settings.max_messages_per_hour || '100';
        }

        // Load Emergency Mode Settings
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
            document.getElementById('emergencyMessageBot').value = settings.message_bot || '';
        }

        // Load Account Policies
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
            document.getElementById('force2FAForSupport').checked = settings.force_2fa_support || false;
        }

        // Load Working Hours
        const { data: workingHours } = await supabase
            .from('working_hours')
            .select('*')
            .order('day_of_week', { ascending: true });

        if (workingHours) {
            currentSettings.workingHours = workingHours;
        }

        // Load After Hours Settings
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

        // Load Ticket Distribution
        const { data: distributionConfig } = await supabase
            .from('ticket_distribution_config')
            .select('*')
            .limit(1)
            .maybeSingle();

        if (distributionConfig) {
            document.getElementById('distributionMethod').value = distributionConfig.method || 'round_robin';
            const settings = distributionConfig.settings || {};
            document.getElementById('distribute-by-load').checked = settings.by_load !== false;
            document.getElementById('distribute-by-type').checked = settings.by_type !== false;
            document.getElementById('distribute-by-time').checked = settings.by_time !== false;
        }

        // Load Rules
        await loadRules();

        // Load Custom Roles
        await loadCustomRoles();

        // Load Audit Log
        await loadAuditLog();

    } catch (error) {
        console.error('Error loading advanced settings:', error);
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
            rulesBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">لا توجد قواعس محددة</td></tr>';
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

        // Setup event listeners for edit/delete buttons
        document.querySelectorAll('.edit-rule-btn').forEach(btn => {
            btn.addEventListener('click', () => editRule(btn.dataset.ruleId));
        });

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

        document.querySelectorAll('.edit-role-btn').forEach(btn => {
            btn.addEventListener('click', () => editRole(btn.dataset.roleId));
        });

        document.querySelectorAll('.delete-role-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteRole(btn.dataset.roleId));
        });

    } catch (error) {
        console.error('Error loading custom roles:', error);
    }
}

async function loadAuditLog() {
    try {
        const { fetchActivityLogs } = await import('/activity-service.js');
        const activities = await fetchActivityLogs({}, 20);

        const auditBody = document.getElementById('auditBody');
        if (!auditBody) return;

        if (!activities || activities.length === 0) {
            auditBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">لا توجد سجلات نشاط</td></tr>';
            return;
        }

        auditBody.innerHTML = activities.map(a => {
            const userName = a.profiles?.full_name || 'مستخدم غير معروف';
            const date = new Date(a.created_at).toLocaleString('ar-EG');
            return `
                <tr>
                    <td>${userName}</td>
                    <td><span class="badge badge-success">${a.action}</span></td>
                    <td>${JSON.stringify(a.details).substring(0, 50)}...</td>
                    <td>${date}</td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading audit log:', error);
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

    // Load saved working hours
    if (currentSettings.workingHours) {
        currentSettings.workingHours.forEach(wh => {
            const dayCheckbox = document.querySelector(`.day-working[data-day="${wh.day_of_week}"]`);
            if (dayCheckbox) {
                dayCheckbox.checked = wh.is_working_day;
            }
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
    // Platform Control
    document.getElementById('savePlatformBtn')?.addEventListener('click', savePlatformSettings);

    // Communication Control
    document.getElementById('saveCommunicationBtn')?.addEventListener('click', saveCommunicationSettings);

    // Emergency Mode
    document.getElementById('saveEmergencyBtn')?.addEventListener('click', saveEmergencySettings);

    // Account Policies
    document.getElementById('saveAccountPoliciesBtn')?.addEventListener('click', saveAccountPolicies);

    // Working Hours
    document.getElementById('saveWorkingHoursBtn')?.addEventListener('click', saveWorkingHours);

    // Ticket Distribution
    document.getElementById('saveDistributionBtn')?.addEventListener('click', saveDistribution);

    // Rules
    document.getElementById('addRuleBtn')?.addEventListener('click', () => {
        document.getElementById('ruleFormModal').style.display = 'block';
    });

    document.getElementById('saveRuleBtn')?.addEventListener('click', saveRule);
    document.getElementById('cancelRuleBtn')?.addEventListener('click', () => {
        document.getElementById('ruleFormModal').style.display = 'none';
    });

    // Roles
    document.getElementById('addRoleBtn')?.addEventListener('click', () => {
        document.getElementById('roleFormModal').style.display = 'block';
    });

    document.getElementById('saveRoleBtn')?.addEventListener('click', saveRole);
    document.getElementById('cancelRoleBtn')?.addEventListener('click', () => {
        document.getElementById('roleFormModal').style.display = 'none';
    });

    // Audit Log Filters
    document.getElementById('auditFilterUser')?.addEventListener('input', filterAuditLog);
    document.getElementById('auditFilterAction')?.addEventListener('change', filterAuditLog);
}

async function savePlatformSettings() {
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
}

async function saveCommunicationSettings() {
    const settings = {
        max_open_tickets: parseInt(document.getElementById('maxOpenTickets').value),
        prevent_duplicate_tickets: document.getElementById('preventDuplicateTickets').checked,
        duplicate_check_window: parseInt(document.getElementById('duplicateCheckWindow').value),
        banned_words: document.getElementById('bannedWords').value,
        max_messages_per_minute: parseInt(document.getElementById('maxMessagesPerMinute').value),
        max_messages_per_hour: parseInt(document.getElementById('maxMessagesPerHour').value)
    };

    await saveAdvancedSetting('communication_control', settings);
    await logActivity('admin_updated_settings', { section: 'communication_control' });
}

async function saveEmergencySettings() {
    const settings = {
        enabled: document.getElementById('emergencyModeEnabled').checked,
        disable_ticket_creation: document.getElementById('disableTicketCreation').checked,
        disable_replies: document.getElementById('disableReplies').checked,
        bot_only_mode: document.getElementById('botOnlyMode').checked,
        message_creation: document.getElementById('emergencyMessageCreation').value,
        message_replies: document.getElementById('emergencyMessageReplies').value,
        message_bot: document.getElementById('emergencyMessageBot').value
    };

    await saveAdvancedSetting('emergency_mode', settings);
    await logActivity('admin_updated_settings', { section: 'emergency_mode' });
}

async function saveAccountPolicies() {
    const settings = {
        password_change_interval: parseInt(document.getElementById('passwordChangeInterval').value),
        password_strength: document.getElementById('passwordStrength').value,
        failed_login_attempts: parseInt(document.getElementById('failedLoginAttempts').value),
        lockout_duration: parseInt(document.getElementById('lockoutDuration').value),
        force_2fa_admins: document.getElementById('force2FAForAdmins').checked,
        force_2fa_support: document.getElementById('force2FAForSupport').checked
    };

    await saveAdvancedSetting('account_policies', settings);
    await logActivity('admin_updated_settings', { section: 'account_policies' });
}

async function saveWorkingHours() {
    try {
        const workingHoursData = [];
        const days = 7;

        for (let i = 0; i < days; i++) {
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

        // Delete existing and insert new
        await supabase.from('working_hours').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await supabase.from('working_hours').insert(workingHoursData);

        if (error) throw error;
        showAlert('تم حفظ ساعات العمل بنجاح', 'success');
        await logActivity('admin_updated_settings', { section: 'working_hours' });
    } catch (error) {
        showAlert('خطأ في حفظ ساعات العمل: ' + error.message, 'error');
    }
}

async function saveDistribution() {
    try {
        const settings = {
            by_load: document.getElementById('distribute-by-load').checked,
            by_type: document.getElementById('distribute-by-type').checked,
            by_time: document.getElementById('distribute-by-time').checked
        };

        const { data: existing } = await supabase
            .from('ticket_distribution_config')
            .select('id')
            .limit(1)
            .maybeSingle();

        let error;
        if (existing) {
            ({ error } = await supabase
                .from('ticket_distribution_config')
                .update({
                    method: document.getElementById('distributionMethod').value,
                    settings: settings
                })
                .eq('id', existing.id));
        } else {
            ({ error } = await supabase
                .from('ticket_distribution_config')
                .insert({
                    method: document.getElementById('distributionMethod').value,
                    settings: settings
                }));
        }

        if (error) throw error;
        showAlert('تم حفظ إعدادات التوزيع بنجاح', 'success');
        await logActivity('admin_updated_settings', { section: 'ticket_distribution' });
    } catch (error) {
        showAlert('خطأ في حفظ إعدادات التوزيع: ' + error.message, 'error');
    }
}

async function saveAdvancedSetting(key, value) {
    try {
        const { data: existing } = await supabase
            .from('advanced_settings')
            .select('id')
            .eq('key', key)
            .maybeSingle();

        let error;
        if (existing) {
            ({ error } = await supabase
                .from('advanced_settings')
                .update({ value })
                .eq('key', key));
        } else {
            ({ error } = await supabase
                .from('advanced_settings')
                .insert({ key, value }));
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
        await logActivity('admin_created_rule', { rule_name: rule.name });
    } catch (error) {
        showAlert('خطأ في إضافة القاعدة: ' + error.message, 'error');
    }
}

async function editRule(ruleId) {
    // Implementation for editing rules
    console.log('Edit rule:', ruleId);
}

async function deleteRule(ruleId) {
    if (!confirm('هل أنت متأكد من حذف هذه القاعدة؟')) return;

    try {
        const { error } = await supabase.from('rules_engine').delete().eq('id', ruleId);
        if (error) throw error;

        showAlert('تم حذف القاعدة بنجاح', 'success');
        await loadRules();
        await logActivity('admin_deleted_rule', { rule_id: ruleId });
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
        await logActivity('admin_created_role', { role_name: role.name });
    } catch (error) {
        showAlert('خطأ في إضافة الدور: ' + error.message, 'error');
    }
}

async function editRole(roleId) {
    // Implementation for editing roles
    console.log('Edit role:', roleId);
}

async function deleteRole(roleId) {
    if (!confirm('هل أنت متأكد من حذف هذا الدور؟')) return;

    try {
        const { error } = await supabase.from('custom_roles').delete().eq('id', roleId);
        if (error) throw error;

        showAlert('تم حذف الدور بنجاح', 'success');
        await loadCustomRoles();
        await logActivity('admin_deleted_role', { role_id: roleId });
    } catch (error) {
        showAlert('خطأ في حذف الدور: ' + error.message, 'error');
    }
}

function filterAuditLog() {
    // Implementation for filtering audit log
    console.log('Filter audit log');
}

function showAlert(message, type) {
    const alert = document.getElementById('settingsAlert');
    alert.textContent = message;
    alert.className = `alert alert-${type === 'info' ? 'success' : type}`;
    alert.style.display = 'block';
    
    if (type !== 'info') {
        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }
}

init();
