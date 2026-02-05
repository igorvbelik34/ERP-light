/**
 * Test script for PDF parser
 * Usage: node test-parser.cjs <path-to-pdf>
 */

const fs = require('fs');
const path = require('path');

// Dynamically import the ES module
async function main() {
  const pdfPath = process.argv[2];
  
  if (!pdfPath) {
    console.log('Usage: node test-parser.cjs <path-to-pdf>');
    console.log('Example: node test-parser.cjs ~/Downloads/certificate.pdf');
    process.exit(1);
  }

  const absolutePath = path.resolve(pdfPath);
  
  if (!fs.existsSync(absolutePath)) {
    console.error('File not found:', absolutePath);
    process.exit(1);
  }

  console.log('Reading PDF:', absolutePath);
  const buffer = fs.readFileSync(absolutePath);
  console.log('File size:', buffer.length, 'bytes');

  // Import pdf2json directly
  const PDFParser = require('pdf2json');
  
  const pdfParser = new PDFParser(null, true);

  pdfParser.on('pdfParser_dataError', (errData) => {
    console.error('PDF Parse Error:', errData);
    process.exit(1);
  });

  pdfParser.on('pdfParser_dataReady', (pdfData) => {
    console.log('\n=== PDF Metadata ===');
    console.log('Pages:', pdfData.Pages?.length || 0);
    console.log('Meta:', JSON.stringify(pdfData.Meta, null, 2));
    
    // Extract text
    const textParts = [];
    if (pdfData.Pages) {
      for (const page of pdfData.Pages) {
        if (page.Texts) {
          for (const textItem of page.Texts) {
            if (textItem.R) {
              for (const r of textItem.R) {
                if (r.T) {
                  textParts.push(decodeURIComponent(r.T));
                }
              }
            }
          }
        }
        textParts.push('\n--- PAGE BREAK ---\n');
      }
    }
    
    const rawText = textParts.join(' ').trim();
    console.log('\n=== Raw Extracted Text ===');
    console.log(rawText);
    
    // Parse using our patterns
    console.log('\n=== Parsing Bahrain CR Certificate ===');
    const parsed = parseBahrainCRCertificate(rawText);
    console.log(JSON.stringify(parsed, null, 2));
  });

  pdfParser.parseBuffer(buffer);
}

function normalizeRawText(text) {
  let fixed = text.replace(/\s+/g, ' ').trim();
  fixed = fixed.replace(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/g, '$1/$2/$3');
  fixed = fixed.replace(/(\d+)\s*-\s*(\d+)/g, '$1-$2');
  fixed = fixed.replace(/W\.\s*L\.\s*L\.?/gi, 'W.L.L');
  fixed = fixed.replace(/B\.\s*S\.\s*C\.?/gi, 'B.S.C');
  fixed = fixed.replace(/P\.\s*O\.\s*B\s*OX/gi, 'P.O.BOX');
  return fixed;
}

function extractCompanyName(text) {
  const match = text.match(
    /(?:Nam\s*e)\s+([\sA-Z0-9.&'-]+?)\s*(W\.L\.L|B\.S\.C|S\.P\.C)/i
  );
  if (!match) return null;

  const rawName = match[1];
  const suffix = match[2].toUpperCase();
  let name = rawName.replace(/\s+/g, '');

  const businessWords = [
    'CONSULTING', 'CONSULTANCY', 'SERVICES', 'TRADING', 'COMPANY',
    'ENTERPRISES', 'INTERNATIONAL', 'SOLUTIONS', 'TECHNOLOGIES',
    'GROUP', 'HOLDINGS', 'INDUSTRIES', 'INVESTMENTS', 'MANAGEMENT',
    'ENGINEERING', 'CONSTRUCTION', 'LOGISTICS', 'CONTRACTING',
  ];
  for (const word of businessWords) {
    const idx = name.toUpperCase().indexOf(word);
    if (idx > 0 && name[idx - 1] !== ' ') {
      name = name.slice(0, idx) + ' ' + name.slice(idx);
    }
  }

  return { name: name.trim(), suffix };
}

function parseBahrainCRCertificate(text) {
  const result = {
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
  console.log('\n=== Normalized Text ===');
  console.log(normalized.substring(0, 1000) + '...');

  // --- CR Number (e.g. "190640-1") ---
  const crMatch = normalized.match(/(\d{5,}-\d+)/);
  if (crMatch) {
    result.cr_number = crMatch[1];
  }

  // --- Company Name ---
  const company = extractCompanyName(normalized);
  if (company) {
    const fullName = `${company.name} ${company.suffix}`;
    result.company_name = fullName;
    result.legal_name = fullName;
  }

  // --- Registration Date ---
  const regDate = normalized.match(
    /Re?\s*g?\s*i?\s*st\s*ra\s*ti\s*on\s*Da?\s*te?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  if (regDate) {
    result.registration_date = regDate[1];
  }

  // --- Expiry / Due Date ---
  const dueDate = normalized.match(
    /Du\s*e\s*Da?\s*te?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  if (dueDate) {
    result.expiry_date = dueDate[1];
  }

  // --- Registration Type ---
  if (/W\.L\.L/i.test(normalized) || /Li\s*m?\s*it\s*ed\s*Li\s*abi\s*lit\s*y/i.test(normalized)) {
    result.registration_type = 'W.L.L (Limited Liability Company)';
  } else if (/B\.S\.C/i.test(normalized)) {
    result.registration_type = 'B.S.C (Bahrain Shareholding Company)';
  }

  // --- Status ---
  if (/AC\s*TI\s*VE|ACTIVE/i.test(normalized)) {
    result.status = 'Active';
  }

  // --- Address ---
  const addressMatch = normalized.match(
    /MA\s*N?\s*AM\s*A\s*\/\s*([A-Z\s]+?)\/[^0-9]*(\d{2,4})\s+(\d{3,5})\s+(\d{2,5})\s+(\d{1,4})/i
  );
  if (addressMatch) {
    let area = addressMatch[1].trim().replace(/\s+/g, '');
    area = area.charAt(0).toUpperCase() + area.slice(1).toLowerCase();
    result.address.area = area;
    result.address.block = addressMatch[2];
    result.address.road = addressMatch[3];
    result.address.building = addressMatch[4];
    result.address.flat = addressMatch[5];
    result.address.city = 'Manama';
  }

  // --- Activities ---
  const activityPatterns = [
    { pattern: /head\s*.{0,3}of\s*fi\s*ce|Management\s*.{0,3}O\s*ff\s*ic/i, name: 'Head Office / Regional HQ' },
    { pattern: /Off\s*sh\s*or\s*e\s*Co\s*nt\s*ra\s*ct|EPC/i, name: 'Offshore Contracting / EPC' },
    { pattern: /Co\s*mp\s*ut\s*er\s*.{0,3}C\s*ons\s*ul\s*ta\s*nc\s*y/i, name: 'Computer Consultancy & IT Services' },
    { pattern: /Ma\s*nagem\s*ent\s*.{0,3}c\s*ons\s*ul\s*ta\s*nc\s*y/i, name: 'Management Consultancy' },
  ];

  for (const { pattern, name } of activityPatterns) {
    if (pattern.test(normalized) && !result.activities.includes(name)) {
      result.activities.push(name);
    }
  }

  return result;
}

main().catch(console.error);
