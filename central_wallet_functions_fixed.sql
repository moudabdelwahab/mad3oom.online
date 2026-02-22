-- ==================== Central Wallet Functions - Fixed Version ====================
-- This file contains the corrected functions for central wallet operations
-- with proper transaction handling and verification

-- 1. Drop existing functions if they exist (to avoid conflicts)
DROP FUNCTION IF EXISTS transfer_points_from_central(TEXT, BIGINT) CASCADE;
DROP FUNCTION IF EXISTS manage_user_points(TEXT, BIGINT, TEXT) CASCADE;

-- 2. Enhanced function to transfer points from central wallet to a user
-- This function now includes proper transaction handling and verification
CREATE OR REPLACE FUNCTION transfer_points_from_central(
    target_user_email TEXT,
    amount_to_transfer BIGINT
) RETURNS JSONB AS $$
DECLARE
    target_uid UUID;
    current_central_balance BIGINT;
    admin_uid UUID;
    transaction_id UUID;
    user_wallet_before BIGINT;
    user_wallet_after BIGINT;
BEGIN
    -- Get the current admin user ID
    admin_uid := auth.uid();
    
    -- Verify authorization
    IF auth.jwt() ->> 'email' != 'support@mad3oom.online' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'غير مصرح لك بالقيام بهذه العملية',
            'error_code', 'UNAUTHORIZED'
        );
    END IF;

    -- Validate inputs
    IF target_user_email IS NULL OR target_user_email = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'بريد العميل مطلوب',
            'error_code', 'INVALID_EMAIL'
        );
    END IF;

    IF amount_to_transfer IS NULL OR amount_to_transfer <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'يجب أن يكون عدد النقاط أكبر من صفر',
            'error_code', 'INVALID_AMOUNT'
        );
    END IF;

    -- Get the target user ID
    SELECT id INTO target_uid FROM auth.users WHERE email = target_user_email;
    
    IF target_uid IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'المستخدم غير موجود: ' || target_user_email,
            'error_code', 'USER_NOT_FOUND'
        );
    END IF;

    -- Get current central wallet balance
    SELECT balance INTO current_central_balance FROM central_wallet LIMIT 1;

    IF current_central_balance IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'المحفظة المركزية غير موجودة',
            'error_code', 'WALLET_NOT_FOUND'
        );
    END IF;

    IF current_central_balance < amount_to_transfer THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'رصيد المحفظة المركزية غير كافٍ. الرصيد الحالي: ' || current_central_balance,
            'error_code', 'INSUFFICIENT_BALANCE',
            'current_balance', current_central_balance
        );
    END IF;

    -- Get user wallet balance before transfer
    SELECT available_points INTO user_wallet_before 
    FROM user_wallets 
    WHERE user_id = target_uid;
    
    IF user_wallet_before IS NULL THEN
        user_wallet_before := 0;
    END IF;

    -- Start transaction: Update central wallet
    UPDATE central_wallet 
    SET balance = balance - amount_to_transfer,
        total_transferred = total_transferred + amount_to_transfer,
        updated_at = NOW()
    WHERE id = (SELECT id FROM central_wallet LIMIT 1);

    -- Verify central wallet was updated
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'فشل تحديث المحفظة المركزية',
            'error_code', 'UPDATE_FAILED'
        );
    END IF;

    -- Update or insert user wallet
    INSERT INTO user_wallets (user_id, available_points, total_points, created_at, updated_at)
    VALUES (target_uid, amount_to_transfer, amount_to_transfer, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE 
    SET available_points = user_wallets.available_points + amount_to_transfer,
        total_points = user_wallets.total_points + amount_to_transfer,
        updated_at = NOW();

    -- Get user wallet balance after transfer for verification
    SELECT available_points INTO user_wallet_after 
    FROM user_wallets 
    WHERE user_id = target_uid;

    -- Verify user wallet was updated correctly
    IF user_wallet_after != (user_wallet_before + amount_to_transfer) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'فشل التحقق من تحديث محفظة العميل',
            'error_code', 'VERIFICATION_FAILED',
            'expected', user_wallet_before + amount_to_transfer,
            'actual', user_wallet_after
        );
    END IF;

    -- Record the transaction
    INSERT INTO central_wallet_transactions (
        admin_id, 
        target_user_id, 
        amount, 
        transaction_type, 
        previous_balance, 
        new_balance,
        created_at
    )
    VALUES (
        admin_uid, 
        target_uid, 
        amount_to_transfer, 
        'transfer', 
        current_central_balance, 
        current_central_balance - amount_to_transfer,
        NOW()
    )
    RETURNING id INTO transaction_id;

    -- Return success with detailed information
    RETURN jsonb_build_object(
        'success', true,
        'message', 'تم تحويل النقاط بنجاح',
        'transaction_id', transaction_id,
        'amount_transferred', amount_to_transfer,
        'user_email', target_user_email,
        'user_new_balance', user_wallet_after,
        'central_wallet_new_balance', current_central_balance - amount_to_transfer
    );

EXCEPTION WHEN OTHERS THEN
    -- Handle any unexpected errors
    RETURN jsonb_build_object(
        'success', false,
        'message', 'حدث خطأ غير متوقع: ' || SQLERRM,
        'error_code', 'SYSTEM_ERROR'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Enhanced function to manage user points (add, deduct, freeze, unfreeze)
CREATE OR REPLACE FUNCTION manage_user_points(
    target_user_email TEXT,
    amount_change BIGINT,
    action_type TEXT
) RETURNS JSONB AS $$
DECLARE
    target_uid UUID;
    admin_uid UUID;
    current_balance BIGINT;
    new_balance BIGINT;
    transaction_id UUID;
BEGIN
    -- Get the current admin user ID
    admin_uid := auth.uid();
    
    -- Verify authorization
    IF auth.jwt() ->> 'email' != 'support@mad3oom.online' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'غير مصرح لك بالقيام بهذه العملية',
            'error_code', 'UNAUTHORIZED'
        );
    END IF;

    -- Validate inputs
    IF target_user_email IS NULL OR target_user_email = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'بريد العميل مطلوب',
            'error_code', 'INVALID_EMAIL'
        );
    END IF;

    IF action_type NOT IN ('add', 'deduct', 'freeze', 'unfreeze') THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'نوع العملية غير صحيح',
            'error_code', 'INVALID_ACTION'
        );
    END IF;

    -- Get the target user ID
    SELECT id INTO target_uid FROM auth.users WHERE email = target_user_email;
    
    IF target_uid IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'المستخدم غير موجود: ' || target_user_email,
            'error_code', 'USER_NOT_FOUND'
        );
    END IF;

    -- Get current balance
    SELECT available_points INTO current_balance 
    FROM user_wallets 
    WHERE user_id = target_uid;

    IF current_balance IS NULL THEN
        current_balance := 0;
    END IF;

    -- Perform the action
    IF action_type = 'add' THEN
        IF amount_change IS NULL OR amount_change < 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'يجب أن يكون عدد النقاط موجباً',
                'error_code', 'INVALID_AMOUNT'
            );
        END IF;

        UPDATE user_wallets 
        SET available_points = available_points + amount_change,
            total_points = total_points + amount_change,
            updated_at = NOW()
        WHERE user_id = target_uid;

        new_balance := current_balance + amount_change;

    ELSIF action_type = 'deduct' THEN
        IF amount_change IS NULL OR amount_change < 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'يجب أن يكون عدد النقاط موجباً',
                'error_code', 'INVALID_AMOUNT'
            );
        END IF;

        IF current_balance < amount_change THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'رصيد العميل غير كافٍ. الرصيد الحالي: ' || current_balance,
                'error_code', 'INSUFFICIENT_BALANCE',
                'current_balance', current_balance
            );
        END IF;

        UPDATE user_wallets 
        SET available_points = GREATEST(0, available_points - amount_change),
            updated_at = NOW()
        WHERE user_id = target_uid;

        new_balance := GREATEST(0, current_balance - amount_change);

    ELSIF action_type = 'freeze' THEN
        UPDATE user_wallets 
        SET is_frozen = TRUE, 
            updated_at = NOW() 
        WHERE user_id = target_uid;

        new_balance := current_balance;

    ELSIF action_type = 'unfreeze' THEN
        UPDATE user_wallets 
        SET is_frozen = FALSE, 
            updated_at = NOW() 
        WHERE user_id = target_uid;

        new_balance := current_balance;
    END IF;

    -- Record the transaction
    INSERT INTO central_wallet_transactions (
        admin_id, 
        target_user_id, 
        amount, 
        transaction_type,
        previous_balance,
        new_balance,
        created_at
    )
    VALUES (
        admin_uid, 
        target_uid, 
        amount_change, 
        action_type,
        current_balance,
        new_balance,
        NOW()
    )
    RETURNING id INTO transaction_id;

    -- Return success with detailed information
    RETURN jsonb_build_object(
        'success', true,
        'message', 'تمت العملية بنجاح',
        'transaction_id', transaction_id,
        'action_type', action_type,
        'amount', amount_change,
        'user_email', target_user_email,
        'previous_balance', current_balance,
        'new_balance', new_balance
    );

EXCEPTION WHEN OTHERS THEN
    -- Handle any unexpected errors
    RETURN jsonb_build_object(
        'success', false,
        'message', 'حدث خطأ غير متوقع: ' || SQLERRM,
        'error_code', 'SYSTEM_ERROR'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION transfer_points_from_central(TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION manage_user_points(TEXT, BIGINT, TEXT) TO authenticated;

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_central_wallet_transactions_admin_id 
    ON central_wallet_transactions(admin_id);

CREATE INDEX IF NOT EXISTS idx_central_wallet_transactions_target_user_id 
    ON central_wallet_transactions(target_user_id);

CREATE INDEX IF NOT EXISTS idx_central_wallet_transactions_created_at 
    ON central_wallet_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id 
    ON user_wallets(user_id);

-- 6. Create a view for transaction history
CREATE OR REPLACE VIEW central_wallet_transaction_history AS
SELECT 
    cwt.id,
    cwt.admin_id,
    a.email as admin_email,
    cwt.target_user_id,
    u.email as target_email,
    cwt.amount,
    cwt.transaction_type,
    cwt.previous_balance,
    cwt.new_balance,
    cwt.created_at,
    (cwt.new_balance - cwt.previous_balance) as balance_change
FROM central_wallet_transactions cwt
LEFT JOIN auth.users a ON cwt.admin_id = a.id
LEFT JOIN auth.users u ON cwt.target_user_id = u.id
ORDER BY cwt.created_at DESC;

-- 7. Grant access to the view
GRANT SELECT ON central_wallet_transaction_history TO authenticated;
