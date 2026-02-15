import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPECTED_PROJECT_REF = 'nlcxrkzlikhzyqxexego';

function extractProjectRef(url: string) {
  try {
    return new URL(url).hostname.split('.')[0] ?? null;
  } catch (_) {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type GeminiRequest = {
  message?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const projectRef = extractProjectRef(supabaseUrl);
    if (projectRef !== EXPECTED_PROJECT_REF) {
      return new Response(JSON.stringify({ error: 'Supabase project mismatch' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = (await req.json()) as GeminiRequest;
    const message = body?.message?.trim();

    if (!message) {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data: keyRow, error: keyError } = await adminClient
      .from('bot_api_keys')
      .select('key_value')
      .eq('status', 'active')
      .limit(1)
      .single();

    if (keyError) {
      console.error('[gemini-proxy] bot_api_keys query failed', {
        code: keyError.code,
        message: keyError.message
      });
      return new Response(JSON.stringify({ error: 'Unable to read Gemini key' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const geminiKey = keyRow?.key_value?.trim();
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'No active Gemini key configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: message }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('[gemini-proxy] Gemini API error', {
        status: geminiResponse.status,
        body: errorText
      });
      return new Response(JSON.stringify({ error: 'Gemini API request failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const geminiData = await geminiResponse.json();
    const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!reply) {
      return new Response(JSON.stringify({ error: 'Gemini returned empty response' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[gemini-proxy] Unhandled error', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
