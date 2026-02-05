"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  generateStoragePath,
  sanitizeFileName,
  formatFileSize,
  isAllowedFileType,
  type DocType,
  type EntityType,
} from "@/lib/fileUtils";
import {
  Upload,
  Loader2,
  FileText,
  Image as ImageIcon,
  File,
  X,
  Check,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Storage bucket name
const BUCKET_NAME = "erpfiles";

export interface UploadedFile {
  path: string;
  publicUrl: string;
  fileName: string;
  originalName: string;
  size: number;
  mimeType: string;
}

export interface FileUploadProps {
  /** Entity type for path organization */
  entityType: EntityType;
  /** Entity ID (e.g., client UUID, user ID) */
  entityId: string;
  /** Document type category */
  docType: DocType;
  /** Callback when file is uploaded successfully */
  onUploadComplete?: (file: UploadedFile) => void;
  /** Callback on upload error */
  onUploadError?: (error: Error) => void;
  /** Allowed file extensions (e.g., ['pdf', 'jpg', 'png']) */
  allowedTypes?: string[];
  /** Max file size in bytes (default: 10MB) */
  maxSize?: number;
  /** Custom button text */
  buttonText?: string;
  /** Show file preview after upload */
  showPreview?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Variant style */
  variant?: "default" | "outline" | "ghost";
  /** Size variant */
  size?: "default" | "sm" | "lg";
}

export function FileUpload({
  entityType,
  entityId,
  docType,
  onUploadComplete,
  onUploadError,
  allowedTypes = ["pdf", "jpg", "jpeg", "png", "gif", "doc", "docx", "xls", "xlsx"],
  maxSize = 10 * 1024 * 1024, // 10MB
  buttonText = "Upload File",
  showPreview = true,
  className,
  disabled = false,
  variant = "outline",
  size = "default",
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset states
      setError(null);
      setUploadedFile(null);

      // Validate file type
      if (!isAllowedFileType(file.name, allowedTypes)) {
        const errorMsg = `File type not allowed. Allowed: ${allowedTypes.join(", ")}`;
        setError(errorMsg);
        onUploadError?.(new Error(errorMsg));
        return;
      }

      // Validate file size
      if (file.size > maxSize) {
        const errorMsg = `File too large. Max size: ${formatFileSize(maxSize)}`;
        setError(errorMsg);
        onUploadError?.(new Error(errorMsg));
        return;
      }

      setIsUploading(true);

      try {
        const supabase = createClient();

        // Generate safe storage path
        const storagePath = generateStoragePath(file.name, {
          entityType,
          entityId,
          docType,
        });

        // Upload file to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(storagePath);

        const uploadedFileData: UploadedFile = {
          path: storagePath,
          publicUrl: urlData.publicUrl,
          fileName: sanitizeFileName(file.name),
          originalName: file.name,
          size: file.size,
          mimeType: file.type,
        };

        setUploadedFile(uploadedFileData);
        onUploadComplete?.(uploadedFileData);
      } catch (err) {
        console.error("Upload error:", err);
        const errorMsg = err instanceof Error ? err.message : "Upload failed";
        setError(errorMsg);
        onUploadError?.(err instanceof Error ? err : new Error(errorMsg));
      } finally {
        setIsUploading(false);
        // Reset input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [entityType, entityId, docType, allowedTypes, maxSize, onUploadComplete, onUploadError]
  );

  const clearUpload = () => {
    setUploadedFile(null);
    setError(null);
  };

  const getFileIcon = () => {
    if (!uploadedFile) return <Upload className="h-4 w-4" />;
    
    const ext = uploadedFile.fileName.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return <FileText className="h-4 w-4" />;
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) {
      return <ImageIcon className="h-4 w-4" />;
    }
    return <File className="h-4 w-4" />;
  };

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        accept={allowedTypes.map((t) => `.${t}`).join(",")}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* Upload Button */}
      {!uploadedFile && (
        <Button
          type="button"
          variant={variant}
          size={size}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {buttonText}
            </>
          )}
        </Button>
      )}

      {/* Success Preview */}
      {showPreview && uploadedFile && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
            {getFileIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{uploadedFile.originalName}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(uploadedFile.size)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Check className="h-4 w-4 text-green-600" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={clearUpload}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Allowed types hint */}
      {!uploadedFile && !error && (
        <p className="text-xs text-muted-foreground">
          Allowed: {allowedTypes.join(", ").toUpperCase()} (max {formatFileSize(maxSize)})
        </p>
      )}
    </div>
  );
}

/**
 * Hook for programmatic file uploads
 */
export function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const upload = async (
    file: File,
    options: {
      entityType: EntityType;
      entityId: string;
      docType: DocType;
    }
  ): Promise<UploadedFile> => {
    setIsUploading(true);
    setProgress(0);

    try {
      const supabase = createClient();
      
      const storagePath = generateStoragePath(file.name, options);

      setProgress(30);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      setProgress(80);

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath);

      setProgress(100);

      return {
        path: storagePath,
        publicUrl: urlData.publicUrl,
        fileName: sanitizeFileName(file.name),
        originalName: file.name,
        size: file.size,
        mimeType: file.type,
      };
    } finally {
      setIsUploading(false);
    }
  };

  const deleteFile = async (path: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);
      return !error;
    } catch {
      return false;
    }
  };

  return {
    upload,
    deleteFile,
    isUploading,
    progress,
  };
}

export default FileUpload;
