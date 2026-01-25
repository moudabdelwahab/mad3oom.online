-- 1. إضافة عمود image_url إلى جدول tickets إذا لم يكن موجوداً
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='image_url') THEN
        ALTER TABLE tickets ADD COLUMN image_url TEXT;
    END IF;
END $$;

-- 2. التأكد من وجود جدول التذاكر بالبنية الصحيحة (في حال لم يكن موجوداً أصلاً)
-- CREATE TABLE IF NOT EXISTS tickets (
--     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--     user_id UUID REFERENCES auth.users(id) NOT NULL,
--     title TEXT NOT NULL,
--     description TEXT,
--     priority TEXT DEFAULT 'medium',
--     status TEXT DEFAULT 'open',
--     image_url TEXT,
--     created_at TIMESTAMPTZ DEFAULT now()
-- );

-- 3. تفعيل RLS (Row Level Security) لجدول التذاكر
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- 4. سياسة للسماح للمستخدمين برؤية تذاكرهم فقط
CREATE POLICY "Users can view their own tickets" ON tickets
    FOR SELECT USING (auth.uid() = user_id);

-- 5. سياسة للسماح للمستخدمين بإنشاء تذاكرهم الخاصة
CREATE POLICY "Users can create their own tickets" ON tickets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. سياسة للمسؤولين (Admins) لرؤية جميع التذاكر
-- ملاحظة: يفترض وجود عمود role في جدول profiles
CREATE POLICY "Admins can view all tickets" ON tickets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 7. تعليمات إعداد Storage Bucket:
-- يجب إنشاء Bucket باسم 'tickets' في لوحة تحكم Supabase (Storage)
-- وتفعيل خيار "Public" ليكون الوصول للصور متاحاً للجميع عبر الرابط العام.
-- كما يجب إضافة سياسات (Policies) للـ Storage للسماح للمستخدمين المسجلين برفع الصور:
-- CREATE POLICY "Allow authenticated uploads" ON storage.objects
--     FOR INSERT WITH CHECK (bucket_id = 'tickets' AND auth.role() = 'authenticated');
