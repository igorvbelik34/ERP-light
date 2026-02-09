import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseStatement, isSupportedFile } from '@/lib/bank-statement-parser';

/**
 * POST /api/bank/import
 * Import bank transactions from uploaded statement file (xlsx)
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

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!isSupportedFile(file.name)) {
      return NextResponse.json(
        { error: 'Unsupported file format. Please upload .xlsx or .xls file' },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse statement
    const statement = parseStatement(buffer, file.name);

    if (statement.transactions.length === 0) {
      return NextResponse.json(
        { error: 'No transactions found in statement' },
        { status: 400 }
      );
    }

    console.log('Parsed statement:', {
      bank: statement.bankName,
      account: statement.accountNumber,
      iban: statement.iban,
      currency: statement.currency,
      transactions: statement.transactions.length,
    });

    // Get or create bank account
    let bankAccountId: string;
    
    const { data: existingAccount } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('iban', statement.iban)
      .single();

    if (existingAccount) {
      bankAccountId = existingAccount.id;
      
      // Update balance for existing account
      if (statement.closingBalance !== null) {
        await supabase
          .from('bank_accounts')
          .update({
            current_balance: statement.closingBalance,
            opening_balance: statement.openingBalance,
            balance_currency: statement.currency,
            balance_updated_at: new Date().toISOString(),
          })
          .eq('id', bankAccountId);
      }
    } else {
      // Get company_id
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!companySettings) {
        return NextResponse.json(
          { error: 'Company settings not found. Please set up your company first.' },
          { status: 400 }
        );
      }

      // Create bank account with balance
      const { data: newAccount, error: createError } = await supabase
        .from('bank_accounts')
        .insert({
          company_id: companySettings.id,
          user_id: user.id,
          bank_name: statement.bankName,
          iban: statement.iban,
          swift_bic: statement.swiftCode,
          account_currency: statement.currency,
          account_holder_name: statement.accountHolder,
          is_active: true,
          is_primary: false,
          current_balance: statement.closingBalance,
          opening_balance: statement.openingBalance,
          balance_currency: statement.currency,
          balance_updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (createError || !newAccount) {
        console.error('Error creating bank account:', createError);
        return NextResponse.json(
          { error: 'Failed to create bank account' },
          { status: 500 }
        );
      }

      bankAccountId = newAccount.id;
    }

    // Import transactions
    let importedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const tx of statement.transactions) {
      // Check if transaction already exists (by date + amount + description)
      const txDate = tx.transactionDate.toISOString().split('T')[0];
      const amount = tx.creditAmount || -(tx.debitAmount || 0);
      
      const { data: existing } = await supabase
        .from('bank_transactions')
        .select('id')
        .eq('bank_account_id', bankAccountId)
        .eq('transaction_date', txDate)
        .eq('amount', amount)
        .eq('description', tx.description)
        .single();

      if (existing) {
        skippedCount++;
        continue;
      }

      // Insert transaction
      const { error: insertError } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: bankAccountId,
          user_id: user.id,
          transaction_date: txDate,
          value_date: tx.valueDate?.toISOString().split('T')[0] || null,
          amount: amount,
          currency: statement.currency,
          description: tx.description,
          reference: tx.reference,
          transaction_type: tx.creditAmount ? 'credit' : 'debit',
          balance_after: tx.balance,
          is_reconciled: false,
        });

      if (insertError) {
        console.error('Error inserting transaction:', insertError);
        errors.push(`Failed to import: ${tx.description.substring(0, 50)}`);
      } else {
        importedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${importedCount} transactions, skipped ${skippedCount} duplicates`,
      details: {
        bankName: statement.bankName,
        accountNumber: statement.accountNumber,
        iban: statement.iban,
        currency: statement.currency,
        period: statement.statementPeriod,
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
        imported: importedCount,
        skipped: skippedCount,
        total: statement.transactions.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Import error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to import statement: ${message}` },
      { status: 500 }
    );
  }
}
