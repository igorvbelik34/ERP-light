import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { tarabutClient, TarabutTransaction } from '@/lib/tarabut';

/**
 * POST /api/bank/sync
 * Synchronizes transactions from Tarabut for a specific bank account
 * or all accounts if no accountId provided
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { accountId, fromDate, toDate, refresh } = body;

    // Calculate date range (default: last 90 days)
    const from = fromDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const to = toDate || new Date().toISOString();

    // Get accounts to sync
    let accountsQuery = supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('sync_enabled', true)
      .eq('consent_status', 'active')
      .not('tarabut_account_id', 'is', null)
      .not('tarabut_consent_id', 'is', null);

    if (accountId) {
      accountsQuery = accountsQuery.eq('id', accountId);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError || !accounts || accounts.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No accounts available for sync',
        synced: 0,
      });
    }

    const results = {
      totalAccounts: accounts.length,
      successfulSyncs: 0,
      failedSyncs: 0,
      totalTransactions: 0,
      newTransactions: 0,
      errors: [] as string[],
    };

    for (const account of accounts) {
      // Create sync log
      const { data: syncLog } = await supabase
        .from('bank_sync_logs')
        .insert({
          user_id: user.id,
          bank_account_id: account.id,
          sync_type: 'transactions',
          status: 'started',
          request_data: { from, to, refresh },
        })
        .select('id')
        .single();

      const syncLogId = syncLog?.id;

      try {
        let transactions: TarabutTransaction[];

        if (refresh) {
          // Refresh from bank (gets latest data)
          const refreshResult = await tarabutClient.refreshTransactions(
            account.tarabut_account_id!,
            account.tarabut_consent_id!
          );
          transactions = refreshResult.transactions || [];
        } else {
          // Get cached transactions with date filter
          const txResult = await tarabutClient.getTransactions(
            account.tarabut_account_id!,
            account.tarabut_consent_id!,
            {
              fromBookingDateTime: from,
              toBookingDateTime: to,
            }
          );
          transactions = txResult.transactions || [];
        }

        results.totalTransactions += transactions.length;
        let newCount = 0;

        // Process each transaction
        for (const tx of transactions) {
          const transactionData = mapTarabutTransaction(tx, account.id, user.id);

          // Upsert transaction (insert or update if exists)
          const { error: upsertError } = await supabase
            .from('bank_transactions')
            .upsert(transactionData, {
              onConflict: 'bank_account_id,tarabut_transaction_id',
              ignoreDuplicates: false,
            });

          if (!upsertError) {
            newCount++;
          }
        }

        results.newTransactions += newCount;
        results.successfulSyncs++;

        // Update sync log with success
        if (syncLogId) {
          await supabase
            .from('bank_sync_logs')
            .update({
              status: 'success',
              records_fetched: transactions.length,
              records_created: newCount,
              completed_at: new Date().toISOString(),
            })
            .eq('id', syncLogId);
        }

        // Update account's last_sync_at
        await supabase
          .from('bank_accounts')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', account.id);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.failedSyncs++;
        results.errors.push(`${account.bank_name || account.iban}: ${errorMessage}`);

        // Update sync log with error
        if (syncLogId) {
          await supabase
            .from('bank_sync_logs')
            .update({
              status: 'error',
              error_message: errorMessage,
              completed_at: new Date().toISOString(),
            })
            .eq('id', syncLogId);
        }

        // If token expired, mark consent as expired
        if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('expired')) {
          await supabase
            .from('bank_accounts')
            .update({ consent_status: 'expired' })
            .eq('id', account.id);
        }
      }
    }

    // Try auto-reconciliation for new transactions
    if (results.newTransactions > 0) {
      try {
        const { data: unreconciled } = await supabase
          .from('bank_transactions')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_reconciled', false)
          .eq('transaction_type', 'credit')
          .limit(50);

        if (unreconciled) {
          for (const tx of unreconciled) {
            await supabase.rpc('auto_reconcile_transaction', { p_transaction_id: tx.id });
          }
        }
      } catch (autoReconcileError) {
        console.error('Auto-reconcile error:', autoReconcileError);
      }
    }

    return NextResponse.json({
      success: results.successfulSyncs > 0,
      ...results,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Map Tarabut transaction to our database format
 */
function mapTarabutTransaction(
  tx: TarabutTransaction,
  bankAccountId: string,
  userId: string
) {
  const amount = parseFloat(tx.amount.amount);
  
  return {
    bank_account_id: bankAccountId,
    user_id: userId,
    tarabut_transaction_id: tx.transactionId,
    transaction_date: tx.bookingDateTime.split('T')[0],
    booking_date: tx.bookingDateTime.split('T')[0],
    value_date: tx.valueDateTime?.split('T')[0] || null,
    amount: tx.creditDebitIndicator === 'Debit' ? -Math.abs(amount) : Math.abs(amount),
    currency: tx.amount.currency,
    description: tx.transactionInformation || null,
    reference: tx.transactionReference || null,
    merchant_name: tx.merchantDetails?.merchantName || null,
    transaction_type: tx.creditDebitIndicator.toLowerCase() as 'credit' | 'debit',
    category: tx.merchantDetails?.merchantCategoryCode || null,
    balance_after: tx.balance ? parseFloat(tx.balance.amount.amount) : null,
    raw_data: tx as unknown as Record<string, unknown>,
  };
}
