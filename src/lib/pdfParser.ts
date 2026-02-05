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
 * Fixes text with spaces between letters (common PDF extraction issue)
 * Example: "Re gi st ra ti on" -> "Registration"
 * Example: "BEL IK C ON SU LT IN G" -> "BELIK CONSULTING"
 */
function fixSpacedText(text: string): string {
  // First, normalize multiple spaces to single space
  let fixed = text.replace(/\s+/g, " ");
  
  // Fix spaced dates first: "14/ 10/ 2025" -> "14/10/2025"
  fixed = fixed.replace(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/g, "$1/$2/$3");
  
  // Fix spaced numbers with hyphen: "190640 - 1" -> "190640-1"
  fixed = fixed.replace(/(\d+)\s*-\s*(\d+)/g, "$1-$2");
  
  // Fix specific abbreviations
  fixed = fixed.replace(/W\.\s*L\.\s*L\.?/gi, "W.L.L");
  fixed = fixed.replace(/B\.\s*S\.\s*C\.?/gi, "B.S.C");
  fixed = fixed.replace(/P\.\s*O\.\s*B\s*OX/gi, "P.O.BOX");
  
  // Fix two-letter groups separated by spaces: "BEL IK" -> "BELIK"
  // This handles the Bahrain PDF format where text is split into 2-3 letter chunks
  // Pattern: sequences of 2-4 uppercase letters separated by single spaces
  fixed = fixed.replace(/\b([A-Z]{2,4})\s+([A-Z]{2,4})\s+([A-Z]{2,4})\s+([A-Z]{2,4})\s+([A-Z]{2,4})\s+([A-Z]{2,4})\b/g, "$1$2$3$4$5$6");
  fixed = fixed.replace(/\b([A-Z]{2,4})\s+([A-Z]{2,4})\s+([A-Z]{2,4})\s+([A-Z]{2,4})\s+([A-Z]{2,4})\b/g, "$1$2$3$4$5");
  fixed = fixed.replace(/\b([A-Z]{2,4})\s+([A-Z]{2,4})\s+([A-Z]{2,4})\s+([A-Z]{2,4})\b/g, "$1$2$3$4");
  fixed = fixed.replace(/\b([A-Z]{2,4})\s+([A-Z]{2,4})\s+([A-Z]{2,4})\b/g, "$1$2$3");
  fixed = fixed.replace(/\b([A-Z]{2,3})\s+([A-Z]{2,3})\b/g, "$1$2");
  
  return fixed;
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

  // First normalize and fix spaced text
  const normalizedText = fixSpacedText(text);
  
  // Also work with the original text with fixed dates for date patterns
  let rawText = text.replace(/\s+/g, " ").trim();
  // Fix date spacing in rawText too: "14/ 10/ 2025" -> "14/10/2025"
  rawText = rawText.replace(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/g, "$1/$2/$3");
  
  console.log("=== NORMALIZED TEXT START ===");
  console.log(normalizedText.substring(0, 1500));
  console.log("=== NORMALIZED TEXT END ===");

  // Extract CR Number (format: 190640-1)
  const crMatch = normalizedText.match(/(\d{5,}-\d+)/);
  if (crMatch) {
    result.cr_number = crMatch[1];
  }

  // Extract Company Name - look for pattern: "Nam e COMPANY_NAME W.L.L"
  // In the raw text, it appears as "BEL IK C ON SU LT IN G W.L.L"
  // After normalization: "BELIKCONSULTING W.L.L" or similar
  const companyPatterns = [
    // Pattern for normalized text
    /(?:Nam\s*e|Name)\s+([A-Z][A-Z0-9]+(?:\s+[A-Z0-9]+)*\s+W\.L\.L)/i,
    // Pattern for partially spaced text: "BEL IK C ON SU LT IN G W.L.L"
    /(?:Nam\s*e|Name)\s+([A-Z]{2,4}(?:\s+[A-Z]{2,4})+\s+W\.L\.L)/i,
  ];
  
  for (const pattern of companyPatterns) {
    const match = normalizedText.match(pattern);
    if (match) {
      // Clean up the name - first remove W.L.L to process name separately
      let name = match[1].trim();
      const hasWLL = /W\.L\.L$/i.test(name);
      name = name.replace(/\s*W\.L\.L$/i, "");
      
      // Remove all internal spaces to get clean name
      name = name.replace(/\s+/g, "");
      
      // Insert spaces before common business words
      const businessWords = [
        "CONSULTING", "SERVICES", "TRADING", "COMPANY", "ENTERPRISES",
        "INTERNATIONAL", "SOLUTIONS", "TECHNOLOGIES", "GROUP", "HOLDINGS",
        "INDUSTRIES", "INVESTMENTS", "MANAGEMENT", "ENGINEERING", "CONSTRUCTION"
      ];
      
      for (const word of businessWords) {
        // Insert space before the word if it's found and not at start
        const regex = new RegExp(`([A-Z])${word}`, "gi");
        name = name.replace(regex, `$1 ${word}`);
      }
      
      // Add W.L.L back if it was there
      if (hasWLL) {
        name = name + " W.L.L";
      }
      
      result.company_name = name.trim();
      result.legal_name = name.trim();
      break;
    }
  }

  // Extract Registration Date - pattern: "Da te 14/10/2025"
  // In raw text: "Re gi st ra ti on Da te 14/10/2025"
  const regDateMatch = rawText.match(/(?:Re\s*gi\s*st\s*ra\s*ti\s*on\s*)?Da\s*te\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (regDateMatch) {
    // This might match Due Date first, so let's be more specific
    const specificRegDate = rawText.match(/Re\s*gi\s*st\s*ra\s*ti\s*on\s*Da\s*te\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (specificRegDate) {
      result.registration_date = specificRegDate[1];
    }
  }

  // Extract Due/Expiry Date - pattern: "Du e Da te 14/10/2026"
  const dueDateMatch = rawText.match(/Du\s*e\s*Da\s*te\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (dueDateMatch) {
    result.expiry_date = dueDateMatch[1];
  }

  // Extract Registration Type
  if (/W\.L\.L|Limited\s*Liability|Li\s*abi\s*lit\s*y/i.test(normalizedText)) {
    result.registration_type = "W.L.L (Limited Liability Company)";
  } else if (/B\.S\.C/i.test(normalizedText)) {
    result.registration_type = "B.S.C (Bahrain Shareholding Company)";
  } else if (/Single\s*Person/i.test(normalizedText)) {
    result.registration_type = "Single Person Company";
  } else if (/Partnership/i.test(normalizedText)) {
    result.registration_type = "Partnership";
  } else if (/Branch/i.test(normalizedText)) {
    result.registration_type = "Branch";
  }

  // Extract Status - pattern: "AC TI VE" or "ACTIVE"
  if (/AC\s*TI\s*VE|ACTIVE/i.test(rawText)) {
    result.status = "Active";
  } else if (/EXPIRED|INACTIVE|CANCELLED/i.test(rawText)) {
    result.status = "Inactive";
  }

  // Extract Address from raw text
  // Pattern: "MA NAM A / AL JU FF AI R / ... 345 4526 1301 51"
  // The numbers at end are: Block Road Building Flat
  const addressMatch = rawText.match(/MA\s*NAM\s*A\s*\/\s*([A-Z\s]+?)\/[^0-9]*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i);
  if (addressMatch) {
    // Clean up area name (remove spaces between letters)
    let area = addressMatch[1].trim().replace(/\s+/g, "");
    // Fix common area name: ALJUFFAIR
    if (area.toUpperCase().includes("JU") || area.toUpperCase().includes("JUFF")) {
      area = "Aljuffair";
    }
    result.address.area = area;
    result.address.block = addressMatch[2];
    result.address.road = addressMatch[3];
    result.address.building = addressMatch[4];
    result.address.flat = addressMatch[5];
    result.address.city = "Manama";
  }

  // Extract Activities from raw text (they contain spaces too)
  const activityPatterns = [
    { pattern: /head\s*of\s*fi\s*ce|Management\s*Office/i, name: "Head Office / Regional HQ" },
    { pattern: /Off\s*sh\s*or\s*e\s*Co\s*nt\s*ra\s*ct|EPC/i, name: "Offshore Contracting / EPC" },
    { pattern: /Co\s*mp\s*ut\s*er\s*C\s*ons\s*ul\s*ta\s*nc\s*y/i, name: "Computer Consultancy & IT Services" },
    { pattern: /fa\s*ci\s*lit\s*ie\s*s\s*ma\s*nagem\s*ent/i, name: "Computer Facilities Management" },
    { pattern: /Ma\s*nagem\s*ent\s*c\s*ons\s*ul\s*ta\s*nc\s*y/i, name: "Management Consultancy" },
    { pattern: /Software\s*Development/i, name: "Software Development" },
    { pattern: /Trading/i, name: "General Trading" },
    { pattern: /Import.*Export/i, name: "Import & Export" },
    { pattern: /Construction/i, name: "Construction" },
    { pattern: /Real\s*Estate/i, name: "Real Estate" },
    { pattern: /Engineering/i, name: "Engineering Services" },
    { pattern: /Marketing/i, name: "Marketing Services" },
  ];

  const foundActivities: string[] = [];
  for (const { pattern, name } of activityPatterns) {
    if (pattern.test(rawText) && !foundActivities.includes(name)) {
      foundActivities.push(name);
    }
  }
  result.activities = foundActivities;

  return result;
}
