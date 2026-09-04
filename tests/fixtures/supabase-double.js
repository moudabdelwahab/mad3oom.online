/**
 * بديل اختباري (test double) لعميل Supabase.
 *
 * الهدف: تشغيل كود لوحة العميل الحقيقي بالكامل (customer-dashboard.js
 * والخدمات المستوردة منه) في متصفح فعلي، من غير أي اتصال بقاعدة بيانات
 * حقيقية. البديل ده بيقلّد الـquery builder اللي الخدمات بتستخدمه فعليًا
 * ويرجّع بيانات ثابتة من window.__FIXTURES__.
 *
 * ملاحظة: الملف ده اختباري فقط ولا يُستخدَم في الإنتاج.
 */

const FX = () => (window.__FIXTURES__ || {});

function resolveRows(table) {
    const rows = FX().tables?.[table];
    return Array.isArray(rows) ? rows.slice() : [];
}

/** query builder قابل للسلسلة (chainable) وقابل للانتظار (thenable). */
function builder(table, mode = 'select') {
    const state = { table, filters: [], single: false, maybeSingle: false, head: false, countMode: null };

    const run = () => {
        let rows = resolveRows(table);
        for (const [col, value] of state.filters) {
            rows = rows.filter(r => {
                if (Array.isArray(value)) return value.includes(r[col]);
                return String(r[col]) === String(value);
            });
        }
        if (state.isNull) rows = rows.filter(r => r[state.isNull] === null || r[state.isNull] === undefined);
        if (state.limit != null) rows = rows.slice(0, state.limit);

        const count = rows.length;
        if (state.head) return { data: null, error: null, count };
        if (state.single || state.maybeSingle) {
            return { data: rows[0] ?? null, error: null, count };
        }
        return { data: rows, error: null, count };
    };

    const api = {
        select(_cols, opts) {
            if (opts?.head) state.head = true;
            if (opts?.count) state.countMode = opts.count;
            return api;
        },
        insert(payload) {
            const row = Array.isArray(payload) ? payload[0] : payload;
            state.inserted = { id: `new-${table}-${Date.now()}`, ticket_number: 9001, ...row };
            (FX().tables?.[table] || []).push(state.inserted);
            return api;
        },
        update(patch) { state.patch = patch; return api; },
        delete() { state.deleted = true; return api; },
        upsert(payload) { return api.insert(payload); },
        eq(col, value) { state.filters.push([col, value]); return api; },
        neq() { return api; },
        gt() { return api; },
        gte() { return api; },
        lte() { return api; },
        lt() { return api; },
        in(col, values) { state.filters.push([col, values]); return api; },
        is(col) { state.isNull = col; return api; },
        or() { return api; },
        ilike() { return api; },
        order() { return api; },
        limit(n) { state.limit = n; return api; },
        range() { return api; },
        single() { state.single = true; return api; },
        maybeSingle() { state.maybeSingle = true; return api; },
        then(onFulfilled, onRejected) {
            let result;
            if (state.inserted) result = { data: state.inserted, error: null };
            else if (state.patch || state.deleted) result = { data: null, error: null };
            else result = run();
            return Promise.resolve(result).then(onFulfilled, onRejected);
        }
    };
    return api;
}

export const supabase = {
    from: (table) => builder(table),
    rpc: async (name, args) => {
        const handler = FX().rpc?.[name];
        if (typeof handler === 'function') return { data: handler(args), error: null };
        if (handler !== undefined) return { data: handler, error: null };
        return { data: null, error: null };
    },
    auth: {
        getUser: async () => ({ data: { user: FX().user || null } }),
        getSession: async () => ({ data: { session: FX().user ? { user: FX().user, access_token: 'test' } : null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        updateUser: async () => ({ data: {}, error: null })
    },
    channel: () => {
        const chan = { on: () => chan, subscribe: () => chan, unsubscribe: () => {} };
        return chan;
    },
    removeChannel: () => {},
    storage: {
        from: () => ({
            upload: async () => ({ error: null }),
            getPublicUrl: (p) => ({ data: { publicUrl: `/uploads/${p}` } })
        })
    }
};

export function debugAuthError() {}
export async function supabaseRestFetch() { return new Response('[]', { status: 200 }); }
