export interface AiTag {
  tag: string;
  confidence: number;
}

export interface FileRecord {
  id: number;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  file_size_mb?: number;
  mime_type?: string;
  is_image?: boolean;
  is_video?: boolean;
  is_audio?: boolean;
  related_type: string | null;
  related_id: number | null;
  category: string | null;
  uploaded_by: number;
  uploaded_at: string;
  url?: string | null;  // Cloudinary URL - direct access, no token needed
  download_url?: string;  // Deprecated - use url instead
  created_at?: string;
  // Cloudinary AI features
  ai_tags?: AiTag[] | null;  // Auto-detected tags from Cloudinary AI
  ocr_text?: string | null;  // Extracted text from OCR
  background_removed_url?: string | null;  // URL with background removed
  optimized_url?: string | null;  // URL with optimizations applied
}
