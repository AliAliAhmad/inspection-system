import { useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { notification as antNotification } from 'antd';
import { notificationsApi, getNotificationRoute, } from '@inspection/shared';
const JOB_ASSIGNMENT_TYPES = new Set([
    'specialist_job_assigned',
    'engineer_job_created',
    'inspection_assigned',
]);
const PRIORITY_COLORS = {
    info: '#1677ff',
    warning: '#fa8c16',
    urgent: '#f5222d',
    critical: '#eb2f96',
};
// --- Web Audio API sound helpers ---
let audioCtx = null;
function getAudioContext() {
    try {
        if (!audioCtx)
            audioCtx = new AudioContext();
        return audioCtx;
    }
    catch {
        return null;
    }
}
/** Single short chime ~300ms */
function playChime() {
    const ctx = getAudioContext();
    if (!ctx)
        return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 440;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
}
/** 5-second repeating two-tone ringtone for job assignments */
function playRingtone() {
    const ctx = getAudioContext();
    if (!ctx)
        return;
    const duration = 5;
    const now = ctx.currentTime;
    // Repeat a two-tone pattern every 0.6s for 5 seconds
    for (let t = 0; t < duration; t += 0.6) {
        // High tone
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.frequency.value = 520;
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0.35, now + t);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + t + 0.2);
        osc1.start(now + t);
        osc1.stop(now + t + 0.25);
        // Low tone
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 660;
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.35, now + t + 0.25);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + t + 0.5);
        osc2.start(now + t + 0.25);
        osc2.stop(now + t + 0.55);
    }
}
// --- Browser Notifications ---
function requestBrowserPermission() {
    if ('Notification' in window && window.Notification.permission === 'default') {
        window.Notification.requestPermission();
    }
}
function showBrowserNotification(title, body) {
    if ('Notification' in window && window.Notification.permission === 'granted') {
        new window.Notification(title, { body, icon: '/icon-192.png' });
    }
}
export function useNotificationAlerts({ user, navigate }) {
    const seenIdsRef = useRef(new Set());
    const initialLoadRef = useRef(true);
    const originalTitleRef = useRef(document.title);
    // Request browser notification permission once
    useEffect(() => {
        requestBrowserPermission();
    }, []);
    // Poll for latest unread notifications
    const { data } = useQuery({
        queryKey: ['notifications', 'alerts'],
        queryFn: () => notificationsApi.list({ unread_only: true, per_page: 5 }).then((r) => r.data),
        refetchInterval: 15000, // Check every 15s for faster detection
        enabled: !!user,
    });
    const showToast = useCallback((item) => {
        const route = user ? getNotificationRoute(item, user.role) : null;
        antNotification.open({
            key: `notif-${item.id}`,
            message: item.title,
            description: item.message,
            placement: 'topRight',
            duration: 8,
            style: { borderLeft: `4px solid ${PRIORITY_COLORS[item.priority]}`, cursor: route ? 'pointer' : undefined },
            onClick: () => {
                antNotification.destroy(`notif-${item.id}`);
                if (route)
                    navigate(route);
            },
        });
    }, [user, navigate]);
    // Detect new notifications and fire alerts
    useEffect(() => {
        if (!data?.data || !user)
            return;
        const notifications = data.data;
        const currentIds = new Set(notifications.map((n) => n.id));
        // On first load, just record existing IDs without alerting
        if (initialLoadRef.current) {
            initialLoadRef.current = false;
            seenIdsRef.current = currentIds;
        }
        else {
            let hasJobAssignment = false;
            let hasOtherNew = false;
            for (const n of notifications) {
                if (!seenIdsRef.current.has(n.id)) {
                    // New notification — show toast
                    showToast(n);
                    if (JOB_ASSIGNMENT_TYPES.has(n.type)) {
                        hasJobAssignment = true;
                    }
                    else {
                        hasOtherNew = true;
                    }
                    // Browser notification for urgent/critical
                    if (n.priority === 'urgent' || n.priority === 'critical') {
                        showBrowserNotification(n.title, n.message);
                    }
                }
            }
            // Play sounds
            if (hasJobAssignment) {
                playRingtone();
            }
            else if (hasOtherNew) {
                playChime();
            }
            seenIdsRef.current = currentIds;
        }
        // Update tab title with unread count
        const total = data?.pagination?.total ?? 0;
        if (total > 0) {
            document.title = `(${total}) ${originalTitleRef.current}`;
        }
        else {
            document.title = originalTitleRef.current;
        }
    }, [data, user, showToast]);
    // Restore title on unmount
    useEffect(() => {
        return () => {
            document.title = originalTitleRef.current;
        };
    }, []);
}
//# sourceMappingURL=useNotificationAlerts.js.map