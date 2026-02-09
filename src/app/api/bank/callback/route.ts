import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { tarabutClient } from '@/lib/tarabut';

/**
 * GET /api/bank/callback
 * Handles the callback from Tarabut after user authorizes bank access
 * 
 * Query params from Tarabut (sandbox):
 * - intentId: The intent ID we created
 * - status: SUCCESSFUL or FAILED
 * - consentId: The consent ID (may not be present in sandbox)
 * - error: Error code if authorization failed
 * - error_description: Error description
 */
export async function GET(request: Request) {
  // Use the configured redirect URI's origin for redirects
  // This fixes issues with reverse proxy not passing correct headers
  const redirectUri = process.env.TARABUT_REDIRECT_URI || '';
  const baseUrl = redirectUri ? new URL(redirectUri).origin : new URL(request.url).origin;
  
  try {
    const { searchParams } = new URL(request.url);
    const intentId = searchParams.get('intentId');
    const status = searchParams.get('status');
    const consentId = searchParams.get('consentId');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    console.log('Callback received:', { intentId, status, consentId, error });

    // Handle error from Tarabut
    if (error) {
      console.error('Tarabut auth error:', error, errorDescription);
      return NextResponse.redirect(
        `${baseUrl}/bank?error=${encodeURIComponent(errorDescription || error)}`
      );
    }

    if (!intentId) {
      return NextResponse.redirect(
        `${baseUrl}/bank?error=Missing+intent+ID`
      );
    }

    // Check status - Tarabut sandbox returns "SUCCESSFUL"
    if (status && status !== 'SUCCESSFUL' && status !== 'Authorised') {
      return NextResponse.redirect(
        `${baseUrl}/bank?error=Authorization+failed:+${status}`
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.redirect(
        `${baseUrl}/auth/signin?error=Session+expired`
      );
    }

    // customerUserId = our internal user ID
    const customerUserId = user.id;

    // Get intent details from Tarabut
    let intentDetails;
    try {
      intentDetails = await tarabutClient.getIntent(intentId, customerUserId);
      console.log('Intent details:', intentDetails);
    } catch (intentError) {
      console.error('Error getting intent:', intentError);
      // Continue anyway - in sandbox the intent might not be retrievable after authorization
    }

    // In sandbox, consentId might be the same as intentId or returned differently
    // Use consentId from callback, from intent details, or fallback to intentId
    const finalConsentId = consentId || intentDetails?.consentId || intentId;

    console.log('Final consent ID:', finalConsentId);

    // Try to get consent details (may fail in sandbox)
    let consentDetails: { providerId?: string; providerName?: string; expiresAt?: string } = {};
    try {
      consentDetails = await tarabutClient.getConsentDetails(finalConsentId, customerUserId);
      console.log('Consent details:', consentDetails);
    } catch (consentError) {
      console.error('Error getting consent details:', consentError);
      // Continue - in sandbox this might not work
    }

    // Update or create consent record
    const { data: existingConsent } = await supabase
      .from('tarabut_consents')
      .select('id')
      .eq('consent_id', intentId)
      .eq('user_id', user.id)
      .single();

    if (existingConsent) {
      await supabase
        .from('tarabut_consents')
        .update({
          consent_id: finalConsentId,
          provider_id: consentDetails.providerId || 'BLUE',
          provider_name: consentDetails.providerName || 'Blue Bank (Sandbox)',
          status: 'active',
          scope: ['ReadAccountsBasic', 'ReadAccountsDetail', 'ReadBalances', 'ReadTransactionsBasic', 'ReadTransactionsDetail'],
          authorized_at: new Date().toISOString(),
          expires_at: consentDetails.expiresAt,
        })
        .eq('id', existingConsent.id);
    } else {
      await supabase
        .from('tarabut_consents')
        .insert({
          user_id: user.id,
          consent_id: finalConsentId,
          provider_id: consentDetails.providerId || 'BLUE',
          provider_name: consentDetails.providerName || 'Blue Bank (Sandbox)',
          status: 'active',
          scope: ['ReadAccountsBasic', 'ReadAccountsDetail', 'ReadBalances', 'ReadTransactionsBasic', 'ReadTransactionsDetail'],
          authorized_at: new Date().toISOString(),
          expires_at: consentDetails.expiresAt,
        });
    }

    // Try to fetch accounts from Tarabut
    try {
      const { accounts } = await tarabutClient.getAccounts(customerUserId);
      console.log('Fetched accounts:', accounts);
      
      // Get company_id for the user
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (companySettings && accounts && accounts.length > 0) {
        const linkedAccountIds: string[] = [];

        for (const account of accounts) {
          // Check if account already exists
          const { data: existingAccount } = await supabase
            .from('bank_accounts')
            .select('id')
            .eq('tarabut_account_id', account.accountId)
            .single();

          if (existingAccount) {
            // Update existing account
            await supabase
              .from('bank_accounts')
              .update({
                tarabut_consent_id: finalConsentId,
                tarabut_provider_id: consentDetails.providerId || account.providerId || 'BLUE',
                consent_status: 'active',
                consent_expires_at: consentDetails.expiresAt,
                bank_name: consentDetails.providerName || 'Blue Bank (Sandbox)',
                iban: account.iban || account.accountNumber || '',
                swift_bic: account.bic || null,
                account_currency: account.currency,
                sync_enabled: true,
              })
              .eq('id', existingAccount.id);
            
            linkedAccountIds.push(existingAccount.id);
          } else {
            // Create new bank account
            const { data: newAccount } = await supabase
              .from('bank_accounts')
              .insert({
                company_id: companySettings.id,
                user_id: user.id,
                tarabut_consent_id: finalConsentId,
                tarabut_account_id: account.accountId,
                tarabut_provider_id: consentDetails.providerId || account.providerId || 'BLUE',
                consent_status: 'active',
                consent_expires_at: consentDetails.expiresAt,
                bank_name: consentDetails.providerName || 'Blue Bank (Sandbox)',
                iban: account.iban || account.accountNumber || '',
                swift_bic: account.bic || null,
                account_currency: account.currency,
                account_holder_name: account.nickname || null,
                is_primary: false,
                is_active: true,
                sync_enabled: true,
              })
              .select('id')
              .single();

            if (newAccount) {
              linkedAccountIds.push(newAccount.id);
            }
          }
        }

        // Update consent with linked account IDs
        await supabase
          .from('tarabut_consents')
          .update({ linked_account_ids: linkedAccountIds })
          .eq('consent_id', finalConsentId);
          
        console.log('Linked accounts:', linkedAccountIds);
      }
    } catch (accountError) {
      console.error('Error fetching accounts:', accountError);
      // Don't fail the whole flow, just log the error
    }

    // Redirect to bank page with success
    return NextResponse.redirect(
      `${baseUrl}/bank?success=Bank+connected+successfully`
    );
  } catch (error) {
    console.error('Callback error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.redirect(
      `${baseUrl}/bank?error=${encodeURIComponent(message)}`
    );
  }
}
