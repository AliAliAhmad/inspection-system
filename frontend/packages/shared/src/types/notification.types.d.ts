export type NotificationPriority = 'info' | 'warning' | 'urgent' | 'critical';
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
}
//# sourceMappingURL=notification.types.d.ts.map