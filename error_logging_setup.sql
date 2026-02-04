-- Create errors table
CREATE TABLE IF NOT EXISTS public.site_errors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL, -- js, promise, network
    message TEXT NOT NULL,
    stack_trace TEXT,
    page_url TEXT,
    file_name TEXT,
    line_number INTEGER,
    column_number INTEGER,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_agent TEXT,
    status TEXT DEFAULT 'new', -- new, resolved, archived
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.site_errors ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to insert errors (for the tracker)
-- In a real production app, we might want to restrict this to authenticated users or use a service role,
-- but since we want to capture errors from all visitors, we allow public insert.
CREATE POLICY "Allow public insert for errors" ON public.site_errors
    FOR INSERT WITH CHECK (true);

-- Policy: Only admins can view errors
-- Assuming there's a way to identify admins, usually via a 'role' column in a profiles table or JWT claims.
-- For now, we'll allow authenticated users to view if they have the 'admin' role in their metadata.
CREATE POLICY "Allow admins to view errors" ON public.site_errors
    FOR SELECT USING (
        auth.jwt() ->> 'role' = 'admin' OR 
        (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true
    );

-- Policy: Only admins can update errors (resolve/archive)
CREATE POLICY "Allow admins to update errors" ON public.site_errors
    FOR UPDATE USING (
        auth.jwt() ->> 'role' = 'admin' OR 
        (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true
    );

-- Enable Realtime for site_errors table
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_errors;
