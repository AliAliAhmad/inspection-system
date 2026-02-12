/** Team Communication Types */

export type ChannelType = 'general' | 'shift' | 'role' | 'job' | 'emergency';
export type MessageType = 'text' | 'voice' | 'photo' | 'video' | 'location' | 'system';
export type ChannelRole = 'admin' | 'member';

export interface TeamChannel {
  id: number;
  name: string;
  description: string | null;
  channel_type: ChannelType;
  shift: string | null;
  role_filter: string | null;
  job_id: number | null;
  is_active: boolean;
  is_default: boolean;
  created_by: number;
  creator_name: string | null;
  member_count: number;
  unread_count?: number;
  last_message?: TeamMessage | null;
  members?: ChannelMember[];
  created_at: string;
  updated_at: string;
}

export interface TeamMessage {
  id: number;
  channel_id: number;
  sender_id: number;
  sender_name: string | null;
  sender_role: string | null;
  message_type: MessageType;
  content: string | null;
  media_url: string | null;
  media_thumbnail: string | null;
  duration_seconds: number | null;
  location_lat: number | null;
  location_lng: number | null;
  location_label: string | null;
  is_priority: boolean;
  is_translated: boolean;
  original_language: string | null;
  translated_content: string | null;
  reply_to_id: number | null;
  is_deleted: boolean;
  read_count: number;
  created_at: string;
}

export interface ChannelMember {
  id: number;
  channel_id: number;
  user_id: number;
  user_name: string | null;
  user_role: string | null;
  role: ChannelRole;
  is_muted: boolean;
  last_read_at: string | null;
  joined_at: string;
}

export interface MessageReadReceipt {
  id: number;
  message_id: number;
  user_id: number;
  user_name: string | null;
  read_at: string;
}

export interface SendMessagePayload {
  message_type?: MessageType;
  content?: string;
  media_url?: string;
  media_thumbnail?: string;
  duration_seconds?: number;
  location_lat?: number;
  location_lng?: number;
  location_label?: string;
  is_priority?: boolean;
  language?: string;
  reply_to_id?: number;
}

export interface CreateChannelPayload {
  name: string;
  description?: string;
  channel_type?: ChannelType;
  shift?: string;
  role_filter?: string;
  job_id?: number;
  is_default?: boolean;
  member_ids?: number[];
}

export interface BroadcastPayload {
  content: string;
  language?: string;
}
