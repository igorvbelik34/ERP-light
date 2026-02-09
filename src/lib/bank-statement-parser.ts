/**
 * Bank Statement Parser
 * Parses Excel bank statements from various banks
 */

import * as XLSX from 'xlsx';

export interface ParsedTransaction {
  transactionDate: Date;
  valueDate: Date | null;
  description: string;
  debitAmount: number | null;
  creditAmount: number | null;
  balance: number | null;
  reference: string | null;
}

export interface ParsedStatement {
  bankName: string;
  accountNumber: string;
  iban: string;
  currency: string;
  swiftCode: string;
  accountHolder: string;
  statementPeriod: {
    from: Date | null;
    to: Date | null;
  };
  openingBalance: number | null;
  closingBalance: number | null;
  transactions: ParsedTransaction[];
}

/**
 * Parse a number from string, handling commas
 */
function parseAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  // Remove commas and parse
  const cleaned = value.toString().replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse date from Ithmaar format (e.g., "04 Feb 26" or "08 Feb 2026")
 */
function parseIthmaarDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  
  const str = dateStr.toString().trim();
  
  // Try "DD Mon YY" format (e.g., "04 Feb 26")
  const match = str.match(/(\d{1,2})\s+(\w{3})\s+(\d{2,4})/);
  if (match) {
    const day = parseInt(match[1]);
    const monthStr = match[2];
    let year = parseInt(match[3]);
    
    // Convert 2-digit year to 4-digit
    if (year < 100) {
      year = year > 50 ? 1900 + year : 2000 + year;
    }
    
    const months: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    
    const month = months[monthStr];
    if (month !== undefined) {
      return new Date(year, month, day);
    }
  }
  
  return null;
}

/**
 * Parse statement period string (e.g., "1 Feb 2026  to 9 Feb 2026")
 */
function parseStatementPeriod(periodStr: string | null | undefined): { from: Date | null; to: Date | null } {
  if (!periodStr) return { from: null, to: null };
  
  const parts = periodStr.toString().split(/\s+to\s+/i);
  return {
    from: parts[0] ? parseIthmaarDate(parts[0]) : null,
    to: parts[1] ? parseIthmaarDate(parts[1]) : null,
  };
}

/**
 * Parse Ithmaar Bank statement from xlsx buffer
 */
export function parseIthmaarStatement(buffer: Buffer): ParsedStatement {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convert to array of arrays
  const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { 
    header: 1,
    defval: null 
  });
  
  const result: ParsedStatement = {
    bankName: 'Ithmaar Bank',
    accountNumber: '',
    iban: '',
    currency: '',
    swiftCode: '',
    accountHolder: '',
    statementPeriod: { from: null, to: null },
    openingBalance: null,
    closingBalance: null,
    transactions: [],
  };
  
  let inTransactions = false;
  let headerRow: (string | number | null)[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    const firstCell = row[0]?.toString().trim() || '';
    const secondCell = row[1]?.toString().trim() || '';
    
    // Parse header information
    if (firstCell === 'Account Number') {
      result.accountNumber = secondCell;
    } else if (firstCell === 'Currency') {
      result.currency = secondCell;
    } else if (firstCell === 'Swift Code') {
      result.swiftCode = secondCell;
    } else if (firstCell === 'IBAN') {
      result.iban = secondCell;
    } else if (firstCell === 'Statement Dates') {
      result.statementPeriod = parseStatementPeriod(secondCell);
    } else if (firstCell.includes('CONSULTING') || firstCell.includes('W.L.L')) {
      result.accountHolder = firstCell;
    }
    
    // Detect transaction header row
    if (firstCell === 'Transaction Date') {
      inTransactions = true;
      headerRow = row;
      continue;
    }
    
    // Parse transactions
    if (inTransactions && firstCell && !firstCell.startsWith('Discrepancies')) {
      const txDate = parseIthmaarDate(row[0]?.toString());
      
      if (txDate) {
        const transaction: ParsedTransaction = {
          transactionDate: txDate,
          valueDate: parseIthmaarDate(row[1]?.toString()),
          description: row[2]?.toString().trim() || '',
          debitAmount: parseAmount(row[3]),
          creditAmount: parseAmount(row[4]),
          balance: parseAmount(row[5]),
          reference: null,
        };
        
        // Extract reference from description if present
        const refMatch = transaction.description.match(/\d{10,}/);
        if (refMatch) {
          transaction.reference = refMatch[0];
        }
        
        result.transactions.push(transaction);
      }
    }
    
    // Stop parsing at disclaimer
    if (firstCell.startsWith('Discrepancies')) {
      break;
    }
  }
  
  // Calculate opening and closing balances from transactions
  if (result.transactions.length > 0) {
    const firstTx = result.transactions[0];
    const lastTx = result.transactions[result.transactions.length - 1];
    
    // Closing balance is the balance after the last transaction
    result.closingBalance = lastTx.balance;
    
    // Opening balance = first transaction balance - transaction amount
    if (firstTx.balance !== null) {
      const txAmount = (firstTx.creditAmount || 0) - (firstTx.debitAmount || 0);
      result.openingBalance = firstTx.balance - txAmount;
    }
  }
  
  return result;
}

/**
 * Auto-detect bank and parse statement
 */
export function parseStatement(buffer: Buffer, filename: string): ParsedStatement {
  // For now, assume Ithmaar format
  // Can be extended to detect and support other banks
  
  const lowercaseName = filename.toLowerCase();
  
  if (lowercaseName.includes('ithmaar')) {
    return parseIthmaarStatement(buffer);
  }
  
  // Default to Ithmaar parser for now
  return parseIthmaarStatement(buffer);
}

/**
 * Supported file extensions
 */
export const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls'];

/**
 * Check if file is supported
 */
export function isSupportedFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return SUPPORTED_EXTENSIONS.includes(ext);
}
