-- 1. إنشاء جدول المحفظة المركزية
CREATE TABLE IF NOT EXISTS central_wallet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    balance BIGINT DEFAULT 10000000,
    total_transferred BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO central_wallet (balance)
SELECT 10000000
WHERE NOT EXISTS (SELECT 1 FROM central_wallet);

ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS central_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id),
    target_user_id UUID REFERENCES auth.users(id),
    amount BIGINT NOT NULL,
    transaction_type TEXT NOT NULL,
    previous_balance BIGINT,
    new_balance BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE central_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only support email can view central wallet" ON central_wallet
    FOR SELECT USING (auth.jwt() ->> 'email' = 'support@mad3oom.online');

CREATE POLICY "Only support email can update central wallet" ON central_wallet
    FOR UPDATE USING (auth.jwt() ->> 'email' = 'support@mad3oom.online');

CREATE POLICY "Only support email can view transactions" ON central_wallet_transactions
    FOR SELECT USING (auth.jwt() ->> 'email' = 'support@mad3oom.online');

CREATE POLICY "Only support email can insert transactions" ON central_wallet_transactions
    FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = 'support@mad3oom.online');
