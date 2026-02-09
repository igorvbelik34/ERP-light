import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/bank/transactions
 * Returns bank transactions from the database
 * Query params:
 * - accountId: filter by specific bank account
 * - from: start date (YYYY-MM-DD)
 * - to: end date (YYYY-MM-DD)
 * - reconciled: filter by reconciliation status (true/false)
 * - limit: number of records (default 100)
 * - offset: pagination offset
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const reconciled = searchParams.get('reconciled');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let query = supabase
      .from('bank_transactions')
      .select(`
        *,
        bank_account:bank_accounts(id, bank_name, iban, account_currency),
        matched_invoice:invoices(id, invoice_number, total, currency, status, client:clients(name))
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (accountId) {
      query = query.eq('bank_account_id', accountId);
    }
    if (fromDate) {
      query = query.gte('transaction_date', fromDate);
    }
    if (toDate) {
      query = query.lte('transaction_date', toDate);
    }
    if (reconciled !== null) {
      query = query.eq('is_reconciled', reconciled === 'true');
    }

    const { data: transactions, error, count } = await query;

    if (error) {
      console.error('Error fetching transactions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    // Get summary stats
    const { data: summaryData } = await supabase
      .rpc('get_unreconciled_summary', { p_user_id: user.id });

    return NextResponse.json({
      transactions: transactions || [],
      total: count || 0,
      limit,
      offset,
      summary: summaryData || {
        total_unreconciled: 0,
        total_credits: 0,
        total_debits: 0,
        oldest_transaction: null,
      },
    });
  } catch (error) {
    console.error('Error in transactions endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/bank/transactions
 * Manually reconcile a transaction with an invoice
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { transactionId, invoiceId, notes } = body;

    if (!transactionId) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    // Get the transaction
    const { data: transaction, error: txError } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('user_id', user.id)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    if (invoiceId) {
      // Verify invoice belongs to user and is valid for reconciliation
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('user_id', user.id)
        .single();

      if (invError || !invoice) {
        return NextResponse.json(
          { error: 'Invoice not found' },
          { status: 404 }
        );
      }

      // Update transaction with reconciliation
      const { error: updateError } = await supabase
        .from('bank_transactions')
        .update({
          matched_invoice_id: invoiceId,
          is_reconciled: true,
          reconciled_at: new Date().toISOString(),
          reconciled_by: user.id,
          reconciliation_notes: notes || null,
        })
        .eq('id', transactionId);

      if (updateError) {
        console.error('Error updating transaction:', updateError);
        return NextResponse.json(
          { error: 'Failed to reconcile transaction' },
          { status: 500 }
        );
      }

      // Update invoice status to paid (if outbound and credit transaction)
      if (invoice.type === 'outbound' && transaction.transaction_type === 'credit') {
        await supabase
          .from('invoices')
          .update({ status: 'paid' })
          .eq('id', invoiceId);
      }

      return NextResponse.json({ 
        success: true,
        message: 'Transaction reconciled with invoice',
      });
    } else {
      // Unreconcile transaction
      const { error: updateError } = await supabase
        .from('bank_transactions')
        .update({
          matched_invoice_id: null,
          is_reconciled: false,
          reconciled_at: null,
          reconciled_by: null,
          reconciliation_notes: null,
        })
        .eq('id', transactionId);

      if (updateError) {
        console.error('Error updating transaction:', updateError);
        return NextResponse.json(
          { error: 'Failed to unreconcile transaction' },
          { status: 500 }
        );
      }

      return NextResponse.json({ 
        success: true,
        message: 'Transaction unreconciled',
      });
    }
  } catch (error) {
    console.error('Error in transactions PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
