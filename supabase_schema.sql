-- 1. Custom Roles Table
CREATE TABLE IF NOT EXISTS custom_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Advanced System Settings (Extending existing system_settings or creating a new one)
-- Assuming we might need to add columns to system_settings or create advanced_settings
CREATE TABLE IF NOT EXISTS advanced_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Rules Engine Table
CREATE TABLE IF NOT EXISTS rules_engine (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    trigger_event TEXT NOT NULL, -- e.g., 'ticket_created', 'no_reply_48h'
    conditions JSONB DEFAULT '[]'::jsonb,
    actions JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Working Hours Table
CREATE TABLE IF NOT EXISTS working_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_of_week INTEGER NOT NULL, -- 0-6 (Sunday-Saturday)
    is_working_day BOOLEAN DEFAULT TRUE,
    start_time TIME,
    end_time TIME,
    auto_reply_text TEXT,
    transfer_to_bot BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Audit Logs (Already exists as activity_logs, but we might need more specific fields)
-- Altering activity_logs if needed (adding IP, device info is already there)

-- 6. User Security Policies (Extending profiles or separate table)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES custom_roles(id);

-- 7. Ticket Distribution Config
CREATE TABLE IF NOT EXISTS ticket_distribution_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    method TEXT DEFAULT 'round_robin', -- 'round_robin', 'load_balanced', 'manual'
    is_active BOOLEAN DEFAULT TRUE,
    settings JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on new tables
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE advanced_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules_engine ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_distribution_config ENABLE ROW LEVEL SECURITY;

-- Basic Policies (Admin only for settings)
CREATE POLICY "Admins can manage custom_roles" ON custom_roles FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "Admins can manage advanced_settings" ON advanced_settings FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "Admins can manage rules_engine" ON rules_engine FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "Admins can manage working_hours" ON working_hours FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "Admins can manage ticket_distribution_config" ON ticket_distribution_config FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
