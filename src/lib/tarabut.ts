/**
 * Tarabut Gateway API Client
 * Open Banking integration for GCC banks (Bahrain, UAE, Saudi)
 * 
 * Based on official Postman collection
 */

// Supported regions
export type TarabutRegion = 'BHR' | 'UAE' | 'SAU';

// API URLs per region (sandbox)
const TARABUT_API_URLS: Record<TarabutRegion, string> = {
  BHR: 'https://api.sandbox.tarabutgateway.io',
  UAE: 'https://api.uae.sandbox.tarabutgateway.io',
  SAU: 'https://api.sau.sandbox.tarabutgateway.io',
};

// Token URL is the same for all regions
const TARABUT_TOKEN_URL = 'https://oauth.tarabutgateway.io/sandbox/token';

const TARABUT_CLIENT_ID = process.env.TARABUT_CLIENT_ID!;
const TARABUT_CLIENT_SECRET = process.env.TARABUT_CLIENT_SECRET!;
const TARABUT_REDIRECT_URI = process.env.TARABUT_REDIRECT_URI!;

// Default region
const DEFAULT_REGION: TarabutRegion = 'BHR';

// =====================================================
// Types
// =====================================================

export interface TarabutError {
  code: string;
  message: string;
  details?: unknown;
}

export interface TarabutProvider {
  providerId: string;
  name: string;
  displayName: string;
  logoUrl: string;
  countryCode: string;
  aisStatus: string;
  pisStatus: string;
}

export interface TarabutAccount {
  accountId: string;
  accountType?: string;
  accountSubType?: string;
  currency: string;
  nickname?: string;
  accountNumber?: string;
  iban?: string;
  bic?: string;
  status?: string;
  providerId?: string;
}

export interface TarabutBalance {
  accountId: string;
  balanceType: string;
  amount: {
    value: string;
    currency: string;
  };
  creditDebitIndicator: string;
  dateTime: string;
}

export interface TarabutTransaction {
  transactionId: string;
  accountId?: string;
  transactionReference?: string;
  amount: {
    value: string;
    currency: string;
  };
  creditDebitIndicator: 'Credit' | 'Debit';
  status?: string;
  bookingDateTime: string;
  valueDateTime?: string;
  transactionInformation?: string;
  description?: string;
  merchantDetails?: {
    merchantName?: string;
    merchantCategoryCode?: string;
  };
  balance?: {
    amount: {
      value: string;
      currency: string;
    };
    creditDebitIndicator: string;
    type: string;
  };
}

export interface CreateIntentResponse {
  intentId: string;
  connectUrl: string;  // Tarabut returns 'connectUrl' not 'consentUrl'
  expiry?: string;
  status?: string;
}

export interface IntentDetails {
  intentId: string;
  status: string;
  consentId?: string;
  providerId?: string;
  providerName?: string;
  accounts?: TarabutAccount[];
}

export interface TarabutConsent {
  id: string;
  status: string;
  providerId?: string;
  providerName?: string;
  createdAt?: string;
  expiresAt?: string;
}

// =====================================================
// API Client
// =====================================================

class TarabutClient {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  /**
   * Get OAuth access token for API calls
   * POST https://oauth.tarabutgateway.io/sandbox/token
   * 
   * Based on Postman collection "Generate Token"
   */
  async getAccessToken(customerUserId: string): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    console.log('Getting Tarabut access token...');
    console.log('Token URL:', TARABUT_TOKEN_URL);

    const response = await fetch(TARABUT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TG-CustomerUserId': customerUserId,
      },
      body: JSON.stringify({
        clientId: TARABUT_CLIENT_ID,
        clientSecret: TARABUT_CLIENT_SECRET,
        grantType: 'client_credentials',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token error response:', response.status, errorText);
      throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('Token response received');
    
    this.accessToken = data.accessToken;
    // Token usually valid for 1 hour, refresh 5 mins before expiry
    const expiresIn = data.expiresIn || 3600;
    this.tokenExpiry = new Date(Date.now() + (expiresIn - 300) * 1000);
    
    return this.accessToken!;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    customerUserId: string,
    options: RequestInit = {},
    region: TarabutRegion = DEFAULT_REGION
  ): Promise<T> {
    const accessToken = await this.getAccessToken(customerUserId);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const baseUrl = TARABUT_API_URLS[region];
    const url = `${baseUrl}${endpoint}`;
    console.log(`Tarabut API request: ${options.method || 'GET'} ${url}`);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Tarabut API error (${endpoint}):`, response.status, errorText);
      throw new Error(`Tarabut API error: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get available bank providers
   * GET /v1/providers
   */
  async getProviders(customerUserId: string, region: TarabutRegion = DEFAULT_REGION): Promise<{ providers: TarabutProvider[] }> {
    return this.request<{ providers: TarabutProvider[] }>('/v1/providers', customerUserId, {}, region);
  }

  /**
   * Create Intent - starts the consent journey
   * POST /accountInformation/v1/intent
   * Returns a connectUrl where user should be redirected
   * 
   * Different body format per region:
   * - BHR: Simple user object
   * - UAE: Requires Emirates ID and consent object
   * - SAU: Similar to BHR
   */
  async createIntent(params: {
    customerUserId: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    mobileNumber?: number;
    providerId?: string;
    region?: TarabutRegion;
    // UAE specific
    emiratesId?: string;
    tradingName?: string;
    legalName?: string;
  }): Promise<CreateIntentResponse> {
    const region = params.region || DEFAULT_REGION;
    
    let body: Record<string, unknown>;
    
    if (region === 'UAE') {
      // UAE requires consent object with Emirates ID
      body = {
        user: {
          customerUserId: params.customerUserId,
          firstName: params.firstName || 'User',
          lastName: params.lastName || 'ERP',
          mobileType: 'ios',
          mobileNumber: String(params.mobileNumber || '971501234567'),
          userIdentifier: {
            type: 'EmiratesID',
            value: params.emiratesId || '784-1234-1234567-1', // Test Emirates ID
          },
        },
        consent: {
          flowType: 'TARABUT_MANAGED',
          providerId: params.providerId || 'BLUE',
          tppDetails: {
            purposeStatement: 'ACCOUNT_AGGREGATION',
            tradingName: params.tradingName || 'ERP Lite',
            legalName: params.legalName || 'ERP Lite',
            identifier: {
              type: 'EmiratesID',
              value: params.emiratesId || '784-1234-1234567-1',
            },
          },
          permissionsList: [
            'ReadAccountsBasic',
            'ReadAccountsDetail',
            'ReadBalances',
            'ReadTransactionsBasic',
            'ReadTransactionsDetail',
          ],
        },
        redirectUrl: TARABUT_REDIRECT_URI,
      };
    } else {
      // BHR and SAU use simpler format
      body = {
        user: {
          customerUserId: params.customerUserId,
          firstName: params.firstName || 'User',
          lastName: params.lastName || 'ERP',
          email: params.email || 'user@example.com',
          mobileNumber: params.mobileNumber || (region === 'SAU' ? 966501234567 : 97312345678),
          mobileType: 'iOS',
        },
        redirectUrl: TARABUT_REDIRECT_URI,
      };
    }

    console.log(`Creating intent for ${region} with body:`, JSON.stringify(body, null, 2));

    return this.request<CreateIntentResponse>(
      '/accountInformation/v1/intent',
      params.customerUserId,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      region
    );
  }

  /**
   * Get Intent details
   * GET /accountInformation/v1/intent/{intentId}
   */
  async getIntent(intentId: string, customerUserId: string, region: TarabutRegion = DEFAULT_REGION): Promise<IntentDetails> {
    return this.request<IntentDetails>(
      `/accountInformation/v1/intent/${intentId}`,
      customerUserId,
      {},
      region
    );
  }

  /**
   * Get linked accounts (v2)
   * GET /accountInformation/v2/accounts
   */
  async getAccounts(customerUserId: string, region: TarabutRegion = DEFAULT_REGION): Promise<{ accounts: TarabutAccount[] }> {
    return this.request<{ accounts: TarabutAccount[] }>(
      '/accountInformation/v2/accounts',
      customerUserId,
      {},
      region
    );
  }

  /**
   * Get account details
   * GET /accountInformation/v2/accounts/{accountId}
   */
  async getAccountDetails(accountId: string, customerUserId: string, region: TarabutRegion = DEFAULT_REGION): Promise<TarabutAccount> {
    return this.request<TarabutAccount>(
      `/accountInformation/v2/accounts/${accountId}`,
      customerUserId,
      {},
      region
    );
  }

  /**
   * Get account balance
   * GET /accountInformation/v2/accounts/{accountId}/balances
   */
  async getBalance(accountId: string, customerUserId: string, region: TarabutRegion = DEFAULT_REGION): Promise<{ balances: TarabutBalance[] }> {
    return this.request<{ balances: TarabutBalance[] }>(
      `/accountInformation/v2/accounts/${accountId}/balances`,
      customerUserId,
      {},
      region
    );
  }

  /**
   * Refresh account balance (fetches latest from bank)
   * GET /accountInformation/v2/accounts/{accountId}/balances/refresh
   */
  async refreshBalance(accountId: string, customerUserId: string, region: TarabutRegion = DEFAULT_REGION): Promise<{ balances: TarabutBalance[] }> {
    return this.request<{ balances: TarabutBalance[] }>(
      `/accountInformation/v2/accounts/${accountId}/balances/refresh`,
      customerUserId,
      {},
      region
    );
  }

  /**
   * Get account transactions
   * GET /accountInformation/v2/accounts/{accountId}/transactions
   */
  async getTransactions(
    accountId: string,
    customerUserId: string,
    params?: {
      fromBookingDateTime?: string;
      toBookingDateTime?: string;
      page?: string;
    },
    region: TarabutRegion = DEFAULT_REGION
  ): Promise<{ transactions: TarabutTransaction[] }> {
    const queryParams = new URLSearchParams();
    if (params?.fromBookingDateTime) {
      queryParams.set('fromBookingDateTime', params.fromBookingDateTime);
    }
    if (params?.toBookingDateTime) {
      queryParams.set('toBookingDateTime', params.toBookingDateTime);
    }
    if (params?.page) {
      queryParams.set('page', params.page);
    }

    const query = queryParams.toString();
    const endpoint = `/accountInformation/v2/accounts/${accountId}/transactions${query ? `?${query}` : ''}`;
    
    return this.request<{ transactions: TarabutTransaction[] }>(endpoint, customerUserId, {}, region);
  }

  /**
   * Get raw transactions (bank format)
   * GET /accountInformation/v2/accounts/{accountId}/rawtransactions
   */
  async getRawTransactions(
    accountId: string,
    customerUserId: string,
    region: TarabutRegion = DEFAULT_REGION
  ): Promise<{ transactions: TarabutTransaction[] }> {
    return this.request<{ transactions: TarabutTransaction[] }>(
      `/accountInformation/v2/accounts/${accountId}/rawtransactions`,
      customerUserId,
      {},
      region
    );
  }

  /**
   * Refresh account transactions (fetches latest from bank)
   * GET /accountInformation/v2/accounts/{accountId}/rawtransactions/refresh
   */
  async refreshTransactions(
    accountId: string,
    customerUserId: string,
    region: TarabutRegion = DEFAULT_REGION
  ): Promise<{ transactions: TarabutTransaction[] }> {
    return this.request<{ transactions: TarabutTransaction[] }>(
      `/accountInformation/v2/accounts/${accountId}/rawtransactions/refresh`,
      customerUserId,
      {},
      region
    );
  }

  /**
   * Get all consents
   * GET /consentInformation/v1/consents
   */
  async getConsents(customerUserId: string, region: TarabutRegion = DEFAULT_REGION): Promise<TarabutConsent[]> {
    return this.request<TarabutConsent[]>('/consentInformation/v1/consents', customerUserId, {}, region);
  }

  /**
   * Get consent details
   * GET /consentInformation/v1/consents/{consentId}
   */
  async getConsentDetails(consentId: string, customerUserId: string, region: TarabutRegion = DEFAULT_REGION): Promise<TarabutConsent> {
    return this.request<TarabutConsent>(
      `/consentInformation/v1/consents/${consentId}`,
      customerUserId,
      {},
      region
    );
  }

  /**
   * Revoke consent
   * DELETE /consentInformation/v1/consents/{consentId}
   */
  async revokeConsent(consentId: string, customerUserId: string): Promise<void> {
    await this.request(
      `/consentInformation/v1/consents/${consentId}`,
      customerUserId,
      { method: 'DELETE' }
    );
  }

  /**
   * Create Consent Dashboard URL
   * POST /consentInformation/v1/dashboard
   * Returns URL for managing all consents
   */
  async createConsentDashboard(params: {
    customerUserId: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  }): Promise<{ dashboardUrl: string }> {
    const body = {
      user: {
        customerUserId: params.customerUserId,
        firstName: params.firstName || 'User',
        lastName: params.lastName || 'ERP',
        email: params.email || 'user@example.com',
      },
      redirectUrl: TARABUT_REDIRECT_URI,
    };

    return this.request<{ dashboardUrl: string }>(
      '/consentInformation/v1/dashboard',
      params.customerUserId,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  }
}

// Export singleton instance
export const tarabutClient = new TarabutClient();

// Export types for use in other files
export type { TarabutClient };
