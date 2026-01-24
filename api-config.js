// api-config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://srnelrdpqkcntbgudyto.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0pvB8_xD0txjdJBkYqXMyg__jKMw71W';

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);
