-- Seed Data for Forum Categories and Subforums

-- 1. Main Categories
INSERT INTO forum_categories (name, description, icon, slug, display_order) VALUES
('الدعم الفني والتقني', 'حل المشكلات التقنية والاستفسارات حول المنصة', 'support', 'technical-support', 1),
('مجتمع المطورين', 'نقاشات حول البرمجة، الربط البرمجي، والتطوير', 'code', 'developers-community', 2),
('الأخبار والتحديثات', 'آخر أخبار المنصة والتحديثات القادمة', 'news', 'news-and-updates', 3),
('النقاش العام', 'مساحة مفتوحة للحديث عن مواضيع متنوعة', 'chat', 'general-discussion', 4);

-- 2. Subforums for Support
INSERT INTO forum_subforums (category_id, name, description, slug, display_order) 
SELECT id, 'مشاكل التذاكر', 'كل ما يخص نظام التذاكر والردود', 'ticket-issues', 1 FROM forum_categories WHERE slug = 'technical-support';

INSERT INTO forum_subforums (category_id, name, description, slug, display_order) 
SELECT id, 'إعدادات الحساب', 'المساعدة في إعدادات الحساب والأمان', 'account-settings', 2 FROM forum_categories WHERE slug = 'technical-support';

-- 3. Subforums for Developers
INSERT INTO forum_subforums (category_id, name, description, slug, display_order) 
SELECT id, 'الربط البرمجي (API)', 'استفسارات حول API المنصة وكيفية استخدامه', 'api-integration', 1 FROM forum_categories WHERE slug = 'developers-community';

INSERT INTO forum_subforums (category_id, name, description, slug, display_order) 
SELECT id, 'تطوير القوالب', 'نقاشات حول تصميم وتطوير واجهات المستخدم', 'theme-development', 2 FROM forum_categories WHERE slug = 'developers-community';

-- 4. Subforums for News
INSERT INTO forum_subforums (category_id, name, description, slug, display_order) 
SELECT id, 'تحديثات المنصة', 'الإعلانات الرسمية عن الميزات الجديدة', 'platform-updates', 1 FROM forum_categories WHERE slug = 'news-and-updates';

INSERT INTO forum_subforums (category_id, name, description, slug, display_order) 
SELECT id, 'مدونة المجتمع', 'مقالات تقنية وقصص نجاح', 'community-blog', 2 FROM forum_categories WHERE slug = 'news-and-updates';

-- 5. Subforums for General
INSERT INTO forum_subforums (category_id, name, description, slug, display_order) 
SELECT id, 'الترحيب والتعارف', 'عرفنا بنفسك وانضم للمجتمع', 'welcome', 1 FROM forum_categories WHERE slug = 'general-discussion';

INSERT INTO forum_subforums (category_id, name, description, slug, display_order) 
SELECT id, 'الاقتراحات والآراء', 'شاركنا أفكارك لتطوير المنصة', 'suggestions', 2 FROM forum_categories WHERE slug = 'general-discussion';
