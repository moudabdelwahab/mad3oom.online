-- 1. جدول مفاتيح الـ API (Bot API Keys)
CREATE TABLE IF NOT EXISTS bot_api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key_value TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL, -- اسم الموقع أو التطبيق المربوط
    website_url TEXT, -- رابط الموقع المربوط
    status TEXT DEFAULT 'active', -- 'active', 'read_only', 'rate_limited', 'maintenance'
    permissions JSONB DEFAULT '["chat:send", "memory:read"]', -- 'chat:send', 'memory:read', 'memory:write', 'admin:none'
    created_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id)
);

-- 2. جدول قواعد جدار حماية الذاكرة (Memory Firewall Rules)
CREATE TABLE IF NOT EXISTS memory_firewall_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rule_type TEXT NOT NULL, -- 'allow_write', 'deny_keyword', 'max_length', 'rate_limit'
    rule_value TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. تفعيل RLS
ALTER TABLE bot_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_firewall_rules ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول لمفاتيح API (الأدمن فقط)
CREATE POLICY "Admins can manage API keys" ON bot_api_keys 
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- سياسات الوصول لقواعد جدار الحماية (الأدمن فقط)
CREATE POLICY "Admins can manage firewall rules" ON memory_firewall_rules 
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- إضافة بعض القواعد الافتراضية لجدار الحماية
INSERT INTO memory_firewall_rules (rule_type, rule_value, description) VALUES 
('deny_keyword', 'password,secret,token', 'منع حفظ الكلمات الحساسة في الذاكرة'),
('max_length', '500', 'الحد الأقصى لطول الرسالة المحفوظة في الذاكرة'),
('allow_write', 'verified_users', 'السماح بالكتابة فقط للمستخدمين الموثقين');
