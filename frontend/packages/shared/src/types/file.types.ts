export interface FileRecord {
  id: number;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  related_type: string | null;
  related_id: number | null;
  category: string | null;
  uploaded_by: number;
  uploaded_at: string;
}
