export interface FileRecord {
  id: number;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  file_size_mb?: number;
  mime_type?: string;
  is_image?: boolean;
  related_type: string | null;
  related_id: number | null;
  category: string | null;
  uploaded_by: number;
  uploaded_at: string;
  download_url?: string;
  created_at?: string;
}
