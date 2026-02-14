-- إنشاء جدول api_keys إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    openai_key TEXT,
    telegram_token TEXT,
    gemini_key TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- تفعيل RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- سياسة للأدمن فقط لإدارة المفاتيح
DROP POLICY IF EXISTS "Admins can manage api_keys" ON api_keys;
CREATE POLICY "Admins can manage api_keys" ON api_keys
    FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- سياسة للقراءة فقط للبوت (يمكن الوصول إليها من قبل أي مستخدم مسجل أو ضيف للرد التلقائي)
DROP POLICY IF EXISTS "Allow read for bot operations" ON api_keys;
CREATE POLICY "Allow read for bot operations" ON api_keys
    FOR SELECT
    USING (true);

-- إدراج سجل افتراضي إذا كان الجدول فارغاً
INSERT INTO api_keys (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM api_keys);
