-- Forum System Setup for mad3oom.online

-- 1. Forum Categories
CREATE TABLE IF NOT EXISTS forum_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    slug TEXT UNIQUE NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Forum Subforums
CREATE TABLE IF NOT EXISTS forum_subforums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES forum_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    slug TEXT UNIQUE NOT NULL,
    display_order INTEGER DEFAULT 0,
    threads_count INTEGER DEFAULT 0,
    posts_count INTEGER DEFAULT 0,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Forum Threads
CREATE TABLE IF NOT EXISTS forum_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subforum_id UUID REFERENCES forum_subforums(id) ON DELETE CASCADE,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- Initial post content
    slug TEXT UNIQUE NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    views_count INTEGER DEFAULT 0,
    replies_count INTEGER DEFAULT 0,
    tags TEXT[],
    last_post_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Forum Replies
CREATE TABLE IF NOT EXISTS forum_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    parent_id UUID REFERENCES forum_replies(id) ON DELETE CASCADE, -- For nested replies/quotes
    is_edited BOOLEAN DEFAULT FALSE,
    edit_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Forum Likes/Votes
CREATE TABLE IF NOT EXISTS forum_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
    reply_id UUID REFERENCES forum_replies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, thread_id),
    UNIQUE(user_id, reply_id),
    CONSTRAINT thread_or_reply CHECK ((thread_id IS NOT NULL AND reply_id IS NULL) OR (thread_id IS NULL AND reply_id IS NOT NULL))
);

-- 6. Forum Mentions
CREATE TABLE IF NOT EXISTS forum_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
    reply_id UUID REFERENCES forum_replies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Forum Reports
CREATE TABLE IF NOT EXISTS forum_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
    reply_id UUID REFERENCES forum_replies(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, reviewed, dismissed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Forum Notifications
CREATE TABLE IF NOT EXISTS forum_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- reply, mention, like
    thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
    reply_id UUID REFERENCES forum_replies(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_subforums ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_notifications ENABLE ROW LEVEL SECURITY;

-- Policies

-- Categories: Read for everyone, Write for admin
CREATE POLICY "Everyone can view categories" ON forum_categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage categories" ON forum_categories FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- Subforums: Read for everyone, Write for admin
CREATE POLICY "Everyone can view subforums" ON forum_subforums FOR SELECT USING (true);
CREATE POLICY "Admins can manage subforums" ON forum_subforums FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- Threads: Read for everyone, Create for authenticated, Update for author/admin
CREATE POLICY "Everyone can view threads" ON forum_threads FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create threads" ON forum_threads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authors/Admins can update threads" ON forum_threads FOR UPDATE USING (
    auth.uid() = author_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- Replies: Read for everyone, Create for authenticated, Update for author/admin
CREATE POLICY "Everyone can view replies" ON forum_replies FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create replies" ON forum_replies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authors/Admins can update replies" ON forum_replies FOR UPDATE USING (
    auth.uid() = author_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- Likes: Read for everyone, Create/Delete for authenticated
CREATE POLICY "Everyone can view likes" ON forum_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage likes" ON forum_likes FOR ALL USING (auth.uid() = user_id);

-- Reports: Create for authenticated, Read for admin
CREATE POLICY "Authenticated users can report" ON forum_reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can view reports" ON forum_reports FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- Notifications: Read/Update for owner
CREATE POLICY "Users can manage own notifications" ON forum_notifications FOR ALL USING (auth.uid() = user_id);

-- Functions and Triggers for Realtime and Counts

-- Function to update subforum counts
CREATE OR REPLACE FUNCTION update_forum_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF (TG_TABLE_NAME = 'forum_threads') THEN
            UPDATE forum_subforums SET threads_count = threads_count + 1, last_activity_at = NOW() WHERE id = NEW.subforum_id;
        ELSIF (TG_TABLE_NAME = 'forum_replies') THEN
            UPDATE forum_threads SET replies_count = replies_count + 1, last_post_at = NOW() WHERE id = NEW.thread_id;
            UPDATE forum_subforums SET posts_count = posts_count + 1, last_activity_at = NOW() WHERE id = (SELECT subforum_id FROM forum_threads WHERE id = NEW.thread_id);
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF (TG_TABLE_NAME = 'forum_threads') THEN
            UPDATE forum_subforums SET threads_count = threads_count - 1 WHERE id = OLD.subforum_id;
        ELSIF (TG_TABLE_NAME = 'forum_replies') THEN
            UPDATE forum_threads SET replies_count = replies_count - 1 WHERE id = OLD.thread_id;
            UPDATE forum_subforums SET posts_count = posts_count - 1 WHERE id = (SELECT subforum_id FROM forum_threads WHERE id = OLD.thread_id);
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_thread_counts AFTER INSERT OR DELETE ON forum_threads FOR EACH ROW EXECUTE FUNCTION update_forum_counts();
CREATE TRIGGER tr_update_reply_counts AFTER INSERT OR DELETE ON forum_replies FOR EACH ROW EXECUTE FUNCTION update_forum_counts();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE forum_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE forum_replies;
ALTER PUBLICATION supabase_realtime ADD TABLE forum_notifications;

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_forum_threads_subforum ON forum_threads(subforum_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_author ON forum_threads(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_last_post ON forum_threads(last_post_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_replies_thread ON forum_replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_forum_replies_author ON forum_replies(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_notifications_user ON forum_notifications(user_id, is_read);
