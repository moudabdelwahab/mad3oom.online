-- تحديث جدول profiles لإضافة الحقول الجديدة
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- تفعيل خاصية Realtime لجدول profiles
-- ملاحظة: قد يكون الجدول مضافاً بالفعل، لذا سنقوم بالتأكد
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    END IF;
END $$;

-- تعيين هوية النسخة المتماثلة إلى FULL لضمان وصول جميع البيانات في Realtime
ALTER TABLE profiles REPLICA IDENTITY FULL;

-- إضافة تعليق للتوضيح
COMMENT ON COLUMN profiles.username IS 'اسم مستخدم فريد لكل عميل';
