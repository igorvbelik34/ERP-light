/**
 * File utilities for safe file naming and path generation
 */

// Cyrillic to Latin transliteration map
const TRANSLITERATION_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ё: "Yo", Ж: "Zh",
  З: "Z", И: "I", Й: "Y", К: "K", Л: "L", М: "M", Н: "N", О: "O",
  П: "P", Р: "R", С: "S", Т: "T", У: "U", Ф: "F", Х: "H", Ц: "Ts",
  Ч: "Ch", Ш: "Sh", Щ: "Sch", Ъ: "", Ы: "Y", Ь: "", Э: "E", Ю: "Yu",
  Я: "Ya",
};

// Arabic transliteration (basic)
const ARABIC_MAP: Record<string, string> = {
  "ا": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh",
  "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s",
  "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q",
  "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w", "ي": "y",
};

/**
 * Transliterate text from Cyrillic/Arabic to Latin
 */
export function transliterate(text: string): string {
  return text
    .split("")
    .map((char) => TRANSLITERATION_MAP[char] || ARABIC_MAP[char] || char)
    .join("");
}

/**
 * Create a safe filename from any input
 * - Transliterates non-Latin characters
 * - Replaces spaces with underscores
 * - Removes special characters
 * - Converts to lowercase
 */
export function sanitizeFileName(fileName: string): string {
  // Get file extension
  const lastDotIndex = fileName.lastIndexOf(".");
  const extension = lastDotIndex > 0 ? fileName.slice(lastDotIndex) : "";
  const baseName = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;

  // Transliterate and clean
  const transliterated = transliterate(baseName);
  
  const safeName = transliterated
    .toLowerCase()
    .replace(/\s+/g, "_")           // Replace spaces with underscores
    .replace(/[^a-z0-9_-]/g, "")    // Remove special characters
    .replace(/_+/g, "_")            // Remove duplicate underscores
    .replace(/^_|_$/g, "");         // Remove leading/trailing underscores

  // Ensure we have a valid name
  const finalName = safeName || "file";
  
  return finalName + extension.toLowerCase();
}

/**
 * Document types for organizing files
 */
export type DocType = 
  | "certificate"
  | "invoice"
  | "contract"
  | "receipt"
  | "logo"
  | "general";

/**
 * Entity types for organizing files
 */
export type EntityType = 
  | "clients"
  | "company"
  | "invoices"
  | "projects";

/**
 * Generate a storage path for a file
 * Format: {entityType}/{entityId}/{docType}/{timestamp}_{safeFileName}
 */
export function generateStoragePath(
  fileName: string,
  options: {
    entityType: EntityType;
    entityId: string;
    docType: DocType;
  }
): string {
  const { entityType, entityId, docType } = options;
  const timestamp = Date.now();
  const safeFileName = sanitizeFileName(fileName);
  
  return `${entityType}/${entityId}/${docType}/${timestamp}_${safeFileName}`;
}

/**
 * Extract file info from a storage path
 */
export function parseStoragePath(path: string): {
  entityType: string;
  entityId: string;
  docType: string;
  fileName: string;
} | null {
  const parts = path.split("/");
  if (parts.length < 4) return null;
  
  return {
    entityType: parts[0],
    entityId: parts[1],
    docType: parts[2],
    fileName: parts.slice(3).join("/"),
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex > 0 ? fileName.slice(lastDotIndex + 1).toLowerCase() : "";
}

/**
 * Check if file type is allowed
 */
export function isAllowedFileType(
  fileName: string,
  allowedTypes: string[]
): boolean {
  const ext = getFileExtension(fileName);
  return allowedTypes.includes(ext) || allowedTypes.includes("*");
}

/**
 * Get MIME type icon name based on file extension
 */
export function getFileIcon(fileName: string): "pdf" | "image" | "document" | "spreadsheet" | "file" {
  const ext = getFileExtension(fileName);
  
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["doc", "docx", "txt", "rtf"].includes(ext)) return "document";
  if (["xls", "xlsx", "csv"].includes(ext)) return "spreadsheet";
  
  return "file";
}
