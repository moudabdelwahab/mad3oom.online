-- ============================================================
-- إضافة دعم نوعي المستخدمين (أفراد وشركات)
-- ============================================================

-- 1. تحديث جدول profiles لإضافة حقل user_type
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'individual' CHECK (user_type IN ('individual', 'company')),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other')),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS country VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;

-- 2. إنشاء جدول companies لتخزين معلومات الشركات
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    commercial_registration_number VARCHAR(100) NOT NULL UNIQUE,
    company_email VARCHAR(320) NOT NULL,
    company_phone VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    website VARCHAR(255),
    industry VARCHAR(100),
    employee_count VARCHAR(50),
    tax_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. إنشاء جدول individuals لتخزين معلومات الأفراد
CREATE TABLE IF NOT EXISTS individuals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    national_id VARCHAR(50) UNIQUE,
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. تفعيل Row Level Security على الجداول الجديدة
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE individuals ENABLE ROW LEVEL SECURITY;

-- 5. إنشاء سياسات الأمان للشركات
CREATE POLICY "Users can view their own company" ON companies FOR SELECT 
    USING (user_id = auth.uid());

CREATE POLICY "Users can update their own company" ON companies FOR UPDATE 
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own company" ON companies FOR INSERT 
    WITH CHECK (user_id = auth.uid());

-- 6. إنشاء سياسات الأمان للأفراد
CREATE POLICY "Users can view their own individual profile" ON individuals FOR SELECT 
    USING (user_id = auth.uid());

CREATE POLICY "Users can update their own individual profile" ON individuals FOR UPDATE 
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own individual profile" ON individuals FOR INSERT 
    WITH CHECK (user_id = auth.uid());

-- 7. إنشاء دالة لتحديث timestamp عند التعديل
CREATE OR REPLACE FUNCTION update_companies_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_individuals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. إنشاء triggers لتحديث timestamp
DROP TRIGGER IF EXISTS update_companies_timestamp_trigger ON companies;
CREATE TRIGGER update_companies_timestamp_trigger
BEFORE UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION update_companies_timestamp();

DROP TRIGGER IF EXISTS update_individuals_timestamp_trigger ON individuals;
CREATE TRIGGER update_individuals_timestamp_trigger
BEFORE UPDATE ON individuals
FOR EACH ROW
EXECUTE FUNCTION update_individuals_timestamp();

-- 9. إنشاء indexes لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id);
CREATE INDEX IF NOT EXISTS idx_companies_commercial_reg ON companies(commercial_registration_number);
CREATE INDEX IF NOT EXISTS idx_individuals_user_id ON individuals(user_id);
CREATE INDEX IF NOT EXISTS idx_individuals_national_id ON individuals(national_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON profiles(user_type);

-- ============================================================
-- ملاحظات:
-- 1. تأكد من تشغيل هذا الـ SQL في Supabase SQL Editor
-- 2. قد تحتاج إلى تحديث سياسات الأمان الموجودة للسماح بالوصول المناسب
-- 3. يمكنك إضافة المزيد من الحقول حسب احتياجاتك
-- ============================================================
