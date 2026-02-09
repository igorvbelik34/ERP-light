import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { tarabutClient, TarabutRegion } from '@/lib/tarabut';

/**
 * GET /api/bank/connect
 * Creates a Tarabut Intent and returns the consent URL for bank linking
 * 
 * Query params:
 * - provider: Optional provider ID (e.g., 'FIBH' for Ithmaar)
 * - region: BHR (Bahrain), UAE, or SAU (Saudi) - default BHR
 * 
 * Flow:
 * 1. Create Intent via Tarabut API
 * 2. Get connectUrl from response
 * 3. Return connectUrl for redirect
 * 4. User authorizes at bank
 * 5. Bank redirects back to our callback URL
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

    // Get params from query
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('provider');
    const regionParam = searchParams.get('region')?.toUpperCase() as TarabutRegion | null;
    const region: TarabutRegion = regionParam && ['BHR', 'UAE', 'SAU'].includes(regionParam) 
      ? regionParam 
      : 'BHR';

    // Get user profile for name/email
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    const [firstName, ...lastNameParts] = (profile?.full_name || user.email || 'User').split(' ');
    const lastName = lastNameParts.join(' ') || 'User';

    console.log(`Creating intent for region: ${region}`);

    // Create Intent via Tarabut API
    // customerUserId is our internal user ID
    const intentResponse = await tarabutClient.createIntent({
      customerUserId: user.id,
      firstName,
      lastName,
      email: profile?.email || user.email || 'user@example.com',
      providerId: providerId || undefined,
      region,
      // UAE specific - can be configured per user later
      emiratesId: region === 'UAE' ? '784-1234-1234567-1' : undefined,
      tradingName: 'ERP Lite',
      legalName: 'BELIK CONSULTING W.L.L',
    });

    console.log('Intent created:', intentResponse);

    // Store intent in database for verification in callback
    try {
      await supabase
        .from('tarabut_consents')
        .insert({
          user_id: user.id,
          consent_id: intentResponse.intentId, // Store intentId, will be updated with consentId later
          provider_id: providerId || 'pending',
          status: 'pending',
          scope: ['ReadAccountsBasic', 'ReadAccountsDetail', 'ReadBalances', 'ReadTransactionsBasic', 'ReadTransactionsDetail'],
          region: region,
        });
    } catch (stateError) {
      console.error('Error storing intent:', stateError);
      // Continue anyway - the flow can still work
    }

    // Return the connect URL for redirect
    return NextResponse.json({ 
      connectUrl: intentResponse.connectUrl,
      intentId: intentResponse.intentId,
      region,
    });
  } catch (error) {
    console.error('Error initiating bank connection:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to initiate bank connection: ${message}` },
      { status: 500 }
    );
  }
}
