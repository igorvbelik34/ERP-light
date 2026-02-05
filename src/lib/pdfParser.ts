/**
 * PDF Parser Service
 * 
 * Системный сервис для парсинга PDF документов.
 * Использует pdf2json - чистую Node.js библиотеку без canvas.
 */

import PDFParser from "pdf2json";

export interface ParsedPDFResult {
  text: string;
  pages: number;
  metadata?: Record<string, unknown>;
}

/**
 * Парсит PDF файл и извлекает текст
 */
export async function parsePDF(buffer: Buffer): Promise<ParsedPDFResult> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, true); // true = don't combine text items

    pdfParser.on("pdfParser_dataError", (errData: Error | { parserError: Error }) => {
      const errorMessage = errData instanceof Error 
        ? errData.message 
        : errData.parserError.message;
      reject(new Error(`PDF parsing error: ${errorMessage}`));
    });

    pdfParser.on("pdfParser_dataReady", (pdfData: PDFData) => {
      try {
        // Extract text from all pages
        const text = extractTextFromPDF(pdfData);
        
        resolve({
          text,
          pages: pdfData.Pages?.length || 0,
          metadata: pdfData.Meta || {},
        });
      } catch (err) {
        reject(err);
      }
    });

    // Parse the buffer
    pdfParser.parseBuffer(buffer);
  });
}

// PDF2JSON types
interface PDFData {
  Pages?: PDFPage[];
  Meta?: Record<string, unknown>;
}

interface PDFPage {
  Texts?: PDFText[];
}

interface PDFText {
  R?: Array<{ T: string }>;
}

/**
 * Извлекает текст из структуры pdf2json
 */
function extractTextFromPDF(pdfData: PDFData): string {
  const textParts: string[] = [];

  if (!pdfData.Pages) return "";

  for (const page of pdfData.Pages) {
    if (!page.Texts) continue;

    for (const textItem of page.Texts) {
      if (textItem.R) {
        for (const r of textItem.R) {
          if (r.T) {
            // Decode URI encoded text
            const decodedText = decodeURIComponent(r.T);
            textParts.push(decodedText);
          }
        }
      }
    }
    // Add page separator
    textParts.push("\n--- PAGE BREAK ---\n");
  }

  return textParts.join(" ").trim();
}

// ============================================
// Bahrain CR Certificate Parser
// ============================================

export interface BahrainCRCertificate {
  company_name: string | null;
  legal_name: string | null;
  cr_number: string | null;
  registration_date: string | null;
  expiry_date: string | null;
  registration_type: string | null;
  status: string | null;
  address: {
    building: string | null;
    road: string | null;
    block: string | null;
    flat: string | null;
    area: string | null;
    city: string | null;
  };
  activities: string[];
}

/**
 * Normalizes pdf2json output: fixes dates, numbers, abbreviations.
 * Does NOT try to merge letter groups — that's unreliable.
 */
function normalizeRawText(text: string): string {
  let fixed = text.replace(/\s+/g, " ").trim();
  fixed = fixed.replace(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/g, "$1/$2/$3");
  fixed = fixed.replace(/(\d+)\s*-\s*(\d+)/g, "$1-$2");
  fixed = fixed.replace(/W\.\s*L\.\s*L\.?/gi, "W.L.L");
  fixed = fixed.replace(/B\.\s*S\.\s*C\.?/gi, "B.S.C");
  fixed = fixed.replace(/P\.\s*O\.\s*B\s*OX/gi, "P.O.BOX");
  return fixed;
}

/**
 * Extracts company name from the fragmented text between "Nam e" and "W.L.L" / "B.S.C".
 * pdf2json splits text into 1-4 char fragments: "BEL IK C ON SU LT IN G W.L.L"
 * Strategy: grab everything between the label and suffix, strip spaces, re-insert word boundaries.
 */
function extractCompanyName(text: string): { name: string; suffix: string } | null {
  // Try multiple patterns for different certificate formats
  const patterns = [
    // Pattern 1: "Name" followed by company name and suffix
    /(?:Nam\s*e)\s+([\sA-Z0-9.&'_-]+?)\s*(W\.L\.L|B\.S\.C|S\.P\.C)/i,
    // Pattern 2: Just look for anything before W.L.L/B.S.C (more flexible)
    /([A-Z][A-Z0-9\s.&'_-]{3,50})\s*(W\.L\.L|B\.S\.C|S\.P\.C)/i,
    // Pattern 3: Commercial Name field
    /(?:Commercial\s*Name|Trade\s*Name)[:\s]*([\sA-Z0-9.&'_-]+?)\s*(W\.L\.L|B\.S\.C|S\.P\.C)?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const rawName = match[1];
      const suffix = (match[2] || "").toUpperCase();

      // Remove all spaces to get the concatenated name
      let name = rawName.replace(/\s+/g, "");

      // Re-insert spaces before known business words
      const businessWords = [
        "CONSULTING", "CONSULTANCY", "SERVICES", "TRADING", "COMPANY",
        "ENTERPRISES", "INTERNATIONAL", "SOLUTIONS", "TECHNOLOGIES",
        "GROUP", "HOLDINGS", "INDUSTRIES", "INVESTMENTS", "MANAGEMENT",
        "ENGINEERING", "CONSTRUCTION", "LOGISTICS", "CONTRACTING",
      ];
      for (const word of businessWords) {
        const idx = name.toUpperCase().indexOf(word);
        if (idx > 0 && name[idx - 1] !== " ") {
          name = name.slice(0, idx) + " " + name.slice(idx);
        }
      }

      const finalName = suffix ? `${name.trim()} ${suffix}` : name.trim();
      if (finalName.length > 3) {
        return { name: name.trim(), suffix: suffix || "" };
      }
    }
  }

  return null;
}

/**
 * Parses Bahrain Commercial Registration Certificate text
 */
export function parseBahrainCRCertificate(text: string): BahrainCRCertificate {
  const result: BahrainCRCertificate = {
    company_name: null,
    legal_name: null,
    cr_number: null,
    registration_date: null,
    expiry_date: null,
    registration_type: null,
    status: null,
    address: {
      building: null,
      road: null,
      block: null,
      flat: null,
      area: null,
      city: null,
    },
    activities: [],
  };

  const normalized = normalizeRawText(text);
  
  // Log normalized text for debugging
  console.log("Normalized text (first 500 chars):", normalized.substring(0, 500));

  // --- CR Number (e.g. "190640-1") ---
  // Try multiple patterns
  const crPatterns = [
    /CR\s*(?:No|Number)?[.:\s]*(\d{5,}-\d+)/i,
    /(?:Commercial\s*Registration|Registration)\s*(?:No|Number)?[.:\s]*(\d{5,}-\d+)/i,
    /(\d{5,}-\d+)/,  // Fallback: any number in format XXXXX-X
  ];
  
  for (const pattern of crPatterns) {
    const crMatch = normalized.match(pattern);
    if (crMatch) {
      result.cr_number = crMatch[1];
      break;
    }
  }

  // --- Company Name ---
  const company = extractCompanyName(normalized);
  if (company) {
    const fullName = company.suffix ? `${company.name} ${company.suffix}` : company.name;
    result.company_name = fullName;
    result.legal_name = fullName;
  }

  // --- Registration Date ---
  const regDatePatterns = [
    /Re?\s*g?\s*i?\s*st\s*ra\s*ti\s*on\s*Da?\s*te?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /(?:Issue|Start)\s*Date[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Date\s*of\s*(?:Issue|Registration)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ];
  
  for (const pattern of regDatePatterns) {
    const regDate = normalized.match(pattern);
    if (regDate) {
      result.registration_date = regDate[1];
      break;
    }
  }

  // --- Expiry / Due Date ---
  const dueDatePatterns = [
    /Du\s*e\s*Da?\s*te?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /(?:Expiry|Expir|Valid\s*Until)\s*Date[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Valid\s*(?:Until|To)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ];
  
  for (const pattern of dueDatePatterns) {
    const dueDate = normalized.match(pattern);
    if (dueDate) {
      result.expiry_date = dueDate[1];
      break;
    }
  }

  // --- Registration Type ---
  if (/W\.L\.L/i.test(normalized) || /Li\s*m?\s*it\s*ed\s*Li\s*abi\s*lit\s*y/i.test(normalized)) {
    result.registration_type = "W.L.L (Limited Liability Company)";
  } else if (/B\.S\.C/i.test(normalized)) {
    result.registration_type = "B.S.C (Bahrain Shareholding Company)";
  } else if (/S\s*i?\s*ngle\s*Per\s*son/i.test(normalized)) {
    result.registration_type = "Single Person Company";
  } else if (/Part\s*ner\s*ship/i.test(normalized)) {
    result.registration_type = "Partnership";
  } else if (/Branch/i.test(normalized)) {
    result.registration_type = "Branch";
  }

  // --- Status ---
  if (/AC\s*TI\s*VE|ACTIVE/i.test(normalized)) {
    result.status = "Active";
  } else if (/EXPIRED|INACTIVE|CANCELLED/i.test(normalized)) {
    result.status = "Inactive";
  }

  // --- Address ---
  // Try multiple patterns for Bahrain addresses
  
  // Pattern 1: "MANAMA / ALJUFFAIR / <arabic> 345 4526 1301 51"
  // Numbers are: Block Road Building Flat
  const addressPatterns = [
    /MA\s*N?\s*AM\s*A\s*\/\s*([A-Z\s]+?)\/[^0-9]*(\d{2,4})\s+(\d{3,5})\s+(\d{2,5})\s+(\d{1,4})/i,
    /(?:Manama|Capital)[^\d]*\/\s*([A-Za-z\s]+)[^\d]*(\d{2,4})\s+(\d{3,5})\s+(\d{2,5})\s+(\d{1,4})/i,
  ];
  
  for (const pattern of addressPatterns) {
    const addressMatch = normalized.match(pattern);
    if (addressMatch) {
      let area = addressMatch[1].trim().replace(/\s+/g, "");
      // Capitalize properly
      area = area.charAt(0).toUpperCase() + area.slice(1).toLowerCase();
      result.address.area = area;
      result.address.block = addressMatch[2];
      result.address.road = addressMatch[3];
      result.address.building = addressMatch[4];
      result.address.flat = addressMatch[5];
      result.address.city = "Manama";
      break;
    }
  }
  
  // If no full match, try to extract individual components
  if (!result.address.city) {
    // Try to find city
    const cityMatch = normalized.match(/(?:City|Governorate)[:\s]*([A-Za-z]+)/i);
    if (cityMatch) {
      result.address.city = cityMatch[1];
    } else if (/Manama/i.test(normalized)) {
      result.address.city = "Manama";
    } else if (/Muharraq/i.test(normalized)) {
      result.address.city = "Muharraq";
    } else if (/Riffa/i.test(normalized)) {
      result.address.city = "Riffa";
    }
    
    // Try to find block
    const blockMatch = normalized.match(/Block[:\s]*(\d+)/i);
    if (blockMatch) result.address.block = blockMatch[1];
    
    // Try to find road
    const roadMatch = normalized.match(/Road[:\s]*(\d+)/i);
    if (roadMatch) result.address.road = roadMatch[1];
    
    // Try to find building
    const buildingMatch = normalized.match(/(?:Building|Bldg)[:\s]*(\d+)/i);
    if (buildingMatch) result.address.building = buildingMatch[1];
    
    // Try to find flat
    const flatMatch = normalized.match(/(?:Flat|Unit|Office)[:\s]*(\d+)/i);
    if (flatMatch) result.address.flat = flatMatch[1];
    
    // Try to find area
    const areaPatterns = [
      /(?:Area|District)[:\s]*([A-Za-z]+)/i,
      /(Juffair|Aljuffair|Seef|Diplomatic\s*Area|Sanabis|Adliya|Hoora|Gudaibiya)/i,
    ];
    for (const pattern of areaPatterns) {
      const areaMatch = normalized.match(pattern);
      if (areaMatch) {
        result.address.area = areaMatch[1];
        break;
      }
    }
  }

  // --- Activities ---
  const activityPatterns = [
    { pattern: /head\s*.{0,3}of\s*fi\s*ce|Management\s*.{0,3}O\s*ff\s*ic/i, name: "Head Office / Regional HQ" },
    { pattern: /Off\s*sh\s*or\s*e\s*Co\s*nt\s*ra\s*ct|EPC/i, name: "Offshore Contracting / EPC" },
    { pattern: /Co\s*mp\s*ut\s*er\s*.{0,3}C\s*ons\s*ul\s*ta\s*nc\s*y/i, name: "Computer Consultancy & IT Services" },
    { pattern: /fa\s*ci\s*lit\s*ie?\s*s\s*ma\s*nagem\s*ent/i, name: "Computer Facilities Management" },
    { pattern: /Ma\s*nagem\s*ent\s*.{0,3}c\s*ons\s*ul\s*ta\s*nc\s*y/i, name: "Management Consultancy" },
    { pattern: /Software/i, name: "Software Development" },
    { pattern: /Tra\s*d\s*ing/i, name: "General Trading" },
    { pattern: /Im\s*port.*Ex\s*port/i, name: "Import & Export" },
    { pattern: /Con\s*st\s*ruc\s*ti\s*on/i, name: "Construction" },
    { pattern: /Re\s*al\s*Est\s*at\s*e/i, name: "Real Estate" },
    { pattern: /Eng\s*in\s*eer\s*ing/i, name: "Engineering Services" },
    { pattern: /Mar\s*ket\s*ing/i, name: "Marketing Services" },
  ];

  for (const { pattern, name } of activityPatterns) {
    if (pattern.test(normalized) && !result.activities.includes(name)) {
      result.activities.push(name);
    }
  }

  return result;
}

// ============================================
// Bank Letter / Bank Statement Parser
// ============================================

export interface BankLetterData {
  bank_name: string | null;
  bank_account: string | null;  // IBAN
  bank_bic: string | null;      // SWIFT/BIC
  bank_address: string | null;
  bank_country: string | null;
  account_currency: string | null;
  account_holder_name: string | null;
}

/**
 * Parses Bank Letter or Bank Statement PDF to extract account details
 */
export function parseBankLetter(text: string): BankLetterData {
  const result: BankLetterData = {
    bank_name: null,
    bank_account: null,
    bank_bic: null,
    bank_address: null,
    bank_country: null,
    account_currency: null,
    account_holder_name: null,
  };

  const normalized = normalizeRawText(text);
  
  console.log("Parsing bank letter, normalized text (first 800 chars):", normalized.substring(0, 800));

  // --- IBAN (International Bank Account Number) ---
  // Format: 2 letters country code + 2 check digits + up to 30 alphanumeric
  // Bahrain IBAN: BH + 2 digits + 4 chars bank code + 14 digits account
  const ibanPatterns = [
    /IBAN[:\s]*([A-Z]{2}\d{2}[A-Z0-9]{4,30})/i,
    /Account\s*(?:Number|No\.?)?[:\s]*([A-Z]{2}\d{2}[A-Z0-9]{4,30})/i,
    /([A-Z]{2}\d{2}[A-Z]{4}[A-Z0-9]{10,20})/,  // Generic IBAN pattern
    /(BH\d{2}[A-Z]{4}\d{14})/i,  // Bahrain specific
  ];
  
  for (const pattern of ibanPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      // Clean up IBAN - remove spaces
      result.bank_account = match[1].replace(/\s/g, '').toUpperCase();
      break;
    }
  }

  // --- SWIFT / BIC Code ---
  // Format: 8 or 11 characters (BANKCCLL or BANKCCLLXXX)
  const swiftPatterns = [
    /(?:SWIFT|BIC)[:\s]*([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)/i,
    /(?:SWIFT|BIC)\s*(?:Code)?[:\s]*([A-Z]{6}[A-Z0-9]{2,5})/i,
    /\b([A-Z]{4}BH[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/,  // Bahrain bank SWIFT
  ];
  
  for (const pattern of swiftPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      result.bank_bic = match[1].toUpperCase();
      break;
    }
  }

  // --- Bank Name ---
  const bankNamePatterns = [
    /(?:Bank\s*Name|Beneficiary\s*Bank)[:\s]*([A-Za-z\s&.]+?)(?:\n|,|SWIFT|BIC|IBAN|Address)/i,
    /(National\s*Bank\s*of\s*Bahrain|NBB)/i,
    /(Ahli\s*United\s*Bank|AUB)/i,
    /(Bank\s*of\s*Bahrain\s*and\s*Kuwait|BBK)/i,
    /(Bahrain\s*Islamic\s*Bank|BIsB)/i,
    /(Al\s*Salam\s*Bank)/i,
    /(Kuwait\s*Finance\s*House|KFH)/i,
    /(Standard\s*Chartered\s*Bank)/i,
    /(HSBC)/i,
    /(Citibank)/i,
    /(Arab\s*Banking\s*Corporation|ABC)/i,
    /(Gulf\s*International\s*Bank|GIB)/i,
  ];
  
  for (const pattern of bankNamePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      let bankName = match[1].trim();
      // Clean up and capitalize
      bankName = bankName.replace(/\s+/g, ' ').trim();
      if (bankName.length > 2 && bankName.length < 100) {
        result.bank_name = bankName;
        break;
      }
    }
  }

  // --- Account Holder Name ---
  const holderPatterns = [
    /(?:Account\s*(?:Holder|Name)|Beneficiary(?:\s*Name)?|In\s*(?:the\s*)?Name\s*of)[:\s]*([A-Za-z\s.&'-]+?)(?:\n|Account|IBAN|Address|,)/i,
    /(?:A\/C\s*Name|Customer\s*Name)[:\s]*([A-Za-z\s.&'-]+?)(?:\n|Account|IBAN)/i,
  ];
  
  for (const pattern of holderPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const holderName = match[1].trim().replace(/\s+/g, ' ');
      if (holderName.length > 2 && holderName.length < 100) {
        result.account_holder_name = holderName;
        break;
      }
    }
  }

  // --- Currency ---
  const currencyPatterns = [
    /(?:Currency|CCY)[:\s]*([A-Z]{3})/i,
    /(?:Account\s*Currency)[:\s]*([A-Z]{3})/i,
    /\b(BHD|USD|EUR|GBP|AED|SAR|KWD|OMR)\b/,
  ];
  
  for (const pattern of currencyPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      result.account_currency = match[1].toUpperCase();
      break;
    }
  }
  
  // Default to BHD for Bahrain
  if (!result.account_currency && result.bank_account?.startsWith('BH')) {
    result.account_currency = 'BHD';
  }

  // --- Bank Address ---
  const addressPatterns = [
    /(?:Bank\s*Address|Branch\s*Address|Address)[:\s]*([A-Za-z0-9\s,.-]+?)(?:\n\n|Country|SWIFT|BIC|Tel|Phone|Fax)/i,
    /(?:P\.?O\.?\s*Box\s*\d+[,\s]*[A-Za-z\s,]+)/i,
  ];
  
  for (const pattern of addressPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const address = match[1] || match[0];
      const cleanAddress = address.trim().replace(/\s+/g, ' ');
      if (cleanAddress.length > 5 && cleanAddress.length < 200) {
        result.bank_address = cleanAddress;
        break;
      }
    }
  }

  // --- Bank Country ---
  if (/Bahrain|Manama|BH\d{2}/i.test(normalized)) {
    result.bank_country = 'Bahrain';
  } else if (/United\s*Arab\s*Emirates|UAE|Dubai|Abu\s*Dhabi/i.test(normalized)) {
    result.bank_country = 'UAE';
  } else if (/Saudi\s*Arabia|KSA|Riyadh|Jeddah/i.test(normalized)) {
    result.bank_country = 'Saudi Arabia';
  } else if (/Kuwait/i.test(normalized)) {
    result.bank_country = 'Kuwait';
  } else if (/Oman|Muscat/i.test(normalized)) {
    result.bank_country = 'Oman';
  } else if (/Qatar|Doha/i.test(normalized)) {
    result.bank_country = 'Qatar';
  }

  return result;
}
