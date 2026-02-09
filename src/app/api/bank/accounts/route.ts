import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { tarabutClient } from '@/lib/tarabut';

/**
 * GET /api/bank/accounts
 * Returns all linked bank accounts with their current balances
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // customerUserId = our internal user ID
    const customerUserId = user.id;

    // Get all bank accounts for the user
    const { data: accounts, error: accountsError } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (accountsError) {
      console.error('Error fetching accounts:', accountsError);
      return NextResponse.json(
        { error: 'Failed to fetch accounts' },
        { status: 500 }
      );
    }

    // For each account, get balance (from Tarabut API or from DB)
    const accountsWithBalances = await Promise.all(
      (accounts || []).map(async (account) => {
        let balance = null;
        let balanceError = null;

        // Try Tarabut API first for linked accounts
        if (account.tarabut_account_id && account.consent_status === 'active') {
          try {
            const { balances } = await tarabutClient.getBalance(
              account.tarabut_account_id,
              customerUserId
            );

            if (balances && balances.length > 0) {
              const balanceData = balances[0];
              balance = {
                amount: parseFloat(balanceData.amount.value),
                currency: balanceData.amount.currency,
                type: balanceData.balanceType,
                indicator: balanceData.creditDebitIndicator,
                dateTime: balanceData.dateTime,
              };
            }
          } catch (err) {
            console.error(`Error fetching balance for account ${account.id}:`, err);
            balanceError = err instanceof Error ? err.message : 'Failed to fetch balance';
            
            // Check if consent expired
            if (balanceError.includes('401') || balanceError.includes('403') || balanceError.includes('expired')) {
              await supabase
                .from('bank_accounts')
                .update({ consent_status: 'expired' })
                .eq('id', account.id);
            }
          }
        }
        
        // If no Tarabut balance, use imported balance from DB
        if (!balance && account.current_balance !== null) {
          balance = {
            amount: parseFloat(account.current_balance),
            currency: account.balance_currency || account.account_currency,
            type: 'ClosingAvailable',
            indicator: account.current_balance >= 0 ? 'Credit' : 'Debit',
            dateTime: account.balance_updated_at,
            source: 'imported', // Mark as imported balance
          };
        }

        return {
          ...account,
          balance,
          balanceError,
        };
      })
    );

    return NextResponse.json({ accounts: accountsWithBalances });
  } catch (error) {
    console.error('Error in accounts endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
