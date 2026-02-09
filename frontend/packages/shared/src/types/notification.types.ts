export type NotificationPriority = 'info' | 'warning' | 'urgent' | 'critical';

export type NotificationSoundType = 'default' | 'chime' | 'urgent' | 'silent';

export type NotificationDigestMode = 'instant' | 'hourly' | 'daily' | 'weekly';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  related_type: string | null;
  related_id: number | null;
  priority: NotificationPriority;
  is_persistent: boolean;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  // Enhanced fields
  acknowledged_at?: string | null;
  snoozed_until?: string | null;
  group_key?: string | null;
  metadata?: Record<string, unknown>;
  sender_id?: number | null;
  sender_name?: string | null;
  mentioned_user_ids?: number[];
}

export interface NotificationPreference {
  id: number;
  user_id: number;
  notification_type: string;
  channels: {
    in_app: boolean;
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  is_enabled: boolean;
  sound_type: NotificationSoundType;
  digest_mode: NotificationDigestMode;
}

export interface NotificationGroup {
  id: number;
  group_key: string;
  group_type: 'similar' | 'related' | 'digest';
  summary_title: string;
  summary_message: string;
  notification_count: number;
  notifications: Notification[];
  created_at: string;
  updated_at: string;
}

export interface NotificationRule {
  id: number;
  name: string;
  description?: string;
  trigger_type: 'threshold' | 'condition' | 'schedule';
  trigger_config: {
    field?: string;
    operator?: string;
    value?: unknown;
    schedule?: string;
    conditions?: Array<{
      field: string;
      operator: string;
      value: unknown;
    }>;
  };
  action_config: {
    template_id?: number;
    priority?: NotificationPriority;
    channels?: NotificationChannel[];
    target_users?: number[];
    target_roles?: string[];
    escalation_delay?: number;
  };
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationAnalytics {
  total_sent: number;
  total_read: number;
  read_rate: number;
  avg_response_time: number;
  by_priority: Record<NotificationPriority, number>;
  by_type: Record<string, number>;
  by_channel: Record<NotificationChannel, number>;
  hourly_distribution: Array<{ hour: number; count: number }>;
  top_users: Array<{ user_id: number; user_name: string; count: number }>;
  escalation_stats: {
    total_escalated: number;
    avg_escalation_time: number;
    resolved_before_escalation: number;
  };
}

export interface AISummary {
  greeting: string;
  summary: string;
  pending_actions: Array<{
    id: number;
    title: string;
    priority: NotificationPriority;
    action_type: string;
  }>;
  predictions: Array<{
    type: string;
    description: string;
    likely_time: string;
    probability: number;
  }>;
  tips: string[];
  generated_at: string;
}

export interface NotificationSchedule {
  id: number;
  user_id: number;
  notification_id?: number;
  schedule_type: 'snooze' | 'reminder' | 'recurring';
  scheduled_for: string;
  repeat_pattern?: string;
  is_active: boolean;
  created_at: string;
}

export interface NotificationFilter {
  types?: string[];
  priorities?: NotificationPriority[];
  is_read?: boolean;
  is_acknowledged?: boolean;
  date_from?: string;
  date_to?: string;
  search?: string;
  group_key?: string;
}

export interface NotificationBulkAction {
  action: 'mark_read' | 'mark_unread' | 'acknowledge' | 'delete' | 'snooze';
  notification_ids: number[];
  snooze_until?: string;
}

export interface DoNotDisturbSchedule {
  id: number;
  user_id: number;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  is_active: boolean;
  allow_critical: boolean;
}

export interface NotificationTemplate {
  id: number;
  name: string;
  type: string;
  title_template: string;
  message_template: string;
  default_priority: NotificationPriority;
  variables: string[];
  is_active: boolean;
}
