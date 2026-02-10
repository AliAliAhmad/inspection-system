import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Typography, Button, Space, Progress, Modal, Select, Input, Alert, Badge } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text, Title } = Typography;
const { TextArea } = Input;

// Generic job type - can be 'specialist_job', 'engineer_job', or any other
export type TimerJobType = 'specialist_job' | 'engineer_job' | string;

export interface PauseReason {
  value: string;
  label: string;
}

export interface SmartTimerProps {
  startedAt: string | null;
  plannedHours: number | null;
  isPaused: boolean;
  pausedMinutes?: number;
  onPause: (reason: string, details?: string) => void;
  onResume: () => void;
  onComplete: () => void;
  jobId: string | number;
  jobType?: TimerJobType;
  pauseReasons?: PauseReason[];
  inactivityWarningMs?: number;
  inactivityAutoPauseMs?: number;
  showCompleteButton?: boolean;
  compact?: boolean;
  borderColor?: string;
}

const DEFAULT_PAUSE_REASONS: PauseReason[] = [
  { value: 'parts', label: 'Waiting for Parts' },
  { value: 'duty_finish', label: 'End of Shift' },
  { value: 'tools', label: 'Need Tools' },
  { value: 'manpower', label: 'Need Assistance' },
  { value: 'oem', label: 'Waiting for OEM' },
  { value: 'other', label: 'Other' },
];

const DEFAULT_INACTIVITY_WARNING_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_INACTIVITY_AUTO_PAUSE_MS = 30 * 60 * 1000; // 30 minutes

export function SmartTimer({
  startedAt,
  plannedHours,
  isPaused,
  pausedMinutes = 0,
  onPause,
  onResume,
  onComplete,
  jobId,
  jobType = 'specialist_job',
  pauseReasons = DEFAULT_PAUSE_REASONS,
  inactivityWarningMs = DEFAULT_INACTIVITY_WARNING_MS,
  inactivityAutoPauseMs = DEFAULT_INACTIVITY_AUTO_PAUSE_MS,
  showCompleteButton = true,
  compact = false,
  borderColor,
}: SmartTimerProps) {
  const { t } = useTranslation();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState<string>('');
  const [pauseDetails, setPauseDetails] = useState('');
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate elapsed time
  useEffect(() => {
    if (!startedAt || isPaused) return;

    const startTime = new Date(startedAt).getTime();
    const pausedMs = (pausedMinutes || 0) * 60 * 1000;

    const updateElapsed = () => {
      const now = Date.now();
      const totalElapsed = now - startTime - pausedMs;
      setElapsedSeconds(Math.max(0, Math.floor(totalElapsed / 1000)));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startedAt, isPaused, pausedMinutes]);

  // Track user activity
  const handleActivity = useCallback(() => {
    setLastActivityTime(Date.now());
    setShowInactivityWarning(false);
  }, []);

  // Setup activity listeners
  useEffect(() => {
    if (isPaused || !startedAt) return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isPaused, startedAt, handleActivity]);

  // Check for inactivity
  useEffect(() => {
    if (isPaused || !startedAt) return;

    const checkInactivity = () => {
      const inactiveMs = Date.now() - lastActivityTime;

      if (inactiveMs >= inactivityAutoPauseMs) {
        // Auto-pause after inactivity
        setShowPauseModal(true);
        setPauseReason('duty_finish');
      } else if (inactiveMs >= inactivityWarningMs) {
        // Show warning
        setShowInactivityWarning(true);
      }
    };

    inactivityTimerRef.current = setInterval(checkInactivity, 60000); // Check every minute

    return () => {
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
      }
    };
  }, [isPaused, startedAt, lastActivityTime, inactivityWarningMs, inactivityAutoPauseMs]);

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const plannedSeconds = (plannedHours || 0) * 3600;
  const progressPercent = plannedSeconds > 0 ? Math.min((elapsedSeconds / plannedSeconds) * 100, 100) : 0;
  const isOvertime = elapsedSeconds > plannedSeconds && plannedSeconds > 0;
  const overtimeSeconds = isOvertime ? elapsedSeconds - plannedSeconds : 0;

  const handlePauseSubmit = () => {
    if (pauseReason) {
      onPause(pauseReason, pauseDetails);
      setShowPauseModal(false);
      setPauseReason('');
      setPauseDetails('');
    }
  };

  const getProgressColor = () => {
    if (isOvertime) return '#f5222d';
    if (progressPercent > 80) return '#faad14';
    return '#52c41a';
  };

  const getBorderColor = () => {
    if (borderColor) return borderColor;
    if (isPaused) return '#722ed1';
    if (isOvertime) return '#f5222d';
    return '#1890ff';
  };

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Badge
          status={isPaused ? 'warning' : 'processing'}
          text={
            <Text style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 600 }}>
              {formatTime(elapsedSeconds)}
            </Text>
          }
        />
        <Space size="small">
          {isPaused ? (
            <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={onResume}>
              {t('jobs.resume', 'Resume')}
            </Button>
          ) : (
            <Button size="small" icon={<PauseCircleOutlined />} onClick={() => setShowPauseModal(true)}>
              {t('jobs.pause', 'Pause')}
            </Button>
          )}
          {showCompleteButton && (
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={onComplete}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            >
              {t('jobs.complete', 'Complete')}
            </Button>
          )}
        </Space>
      </div>
    );
  }

  return (
    <Card
      style={{
        marginBottom: 16,
        borderTop: `3px solid ${getBorderColor()}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        {/* Timer Display */}
        <div style={{ textAlign: 'center', minWidth: 200 }}>
          <Badge
            status={isPaused ? 'warning' : 'processing'}
            text={isPaused ? t('status.paused') : t('status.in_progress')}
            style={{ marginBottom: 8 }}
          />
          <Title level={2} style={{ margin: 0, fontFamily: 'monospace', color: isOvertime ? '#f5222d' : undefined }}>
            {formatTime(elapsedSeconds)}
          </Title>
          {isOvertime && (
            <Text type="danger" style={{ fontSize: 12 }}>
              <WarningOutlined /> {t('jobs.overtime', 'Overtime')}: +{formatTime(overtimeSeconds)}
            </Text>
          )}
        </div>

        {/* Progress */}
        <div style={{ flex: 1, maxWidth: 300, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text type="secondary">{t('jobs.progress', 'Progress')}</Text>
            <Text type="secondary">
              {t('jobs.planned_time')}: {plannedHours || 0}h
            </Text>
          </div>
          <Progress
            percent={progressPercent}
            strokeColor={getProgressColor()}
            status={isOvertime ? 'exception' : 'active'}
            format={(percent) => `${Math.round(percent || 0)}%`}
          />
        </div>

        {/* Actions */}
        <Space>
          {isPaused ? (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={onResume}
              size="large"
            >
              {t('jobs.resume', 'Resume')}
            </Button>
          ) : (
            <Button
              icon={<PauseCircleOutlined />}
              onClick={() => setShowPauseModal(true)}
              size="large"
            >
              {t('jobs.pause', 'Pause')}
            </Button>
          )}
          {showCompleteButton && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={onComplete}
              size="large"
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            >
              {t('jobs.complete', 'Complete')}
            </Button>
          )}
        </Space>
      </div>

      {/* Inactivity Warning */}
      {showInactivityWarning && (
        <Alert
          type="warning"
          message={t('jobs.inactivity_warning', 'Inactivity Detected')}
          description={t('jobs.inactivity_description', 'No activity detected. The timer will auto-pause after extended inactivity.')}
          showIcon
          icon={<ExclamationCircleOutlined />}
          closable
          onClose={() => setShowInactivityWarning(false)}
          style={{ marginTop: 16 }}
          action={
            <Button size="small" onClick={handleActivity}>
              {t('jobs.im_still_working', "I'm Still Working")}
            </Button>
          }
        />
      )}

      {/* Pause Modal */}
      <Modal
        title={t('jobs.pause_job', 'Pause Job')}
        open={showPauseModal}
        onCancel={() => setShowPauseModal(false)}
        onOk={handlePauseSubmit}
        okText={t('jobs.pause', 'Pause')}
        okButtonProps={{ disabled: !pauseReason }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>{t('jobs.pause_reason', 'Reason for Pause')}</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              placeholder={t('jobs.select_reason', 'Select a reason')}
              value={pauseReason || undefined}
              onChange={setPauseReason}
              options={pauseReasons.map((r) => ({
                value: r.value,
                label: t(`jobs.pause_reasons.${r.value}`, r.label),
              }))}
            />
          </div>

          <div>
            <Text strong>{t('jobs.additional_details', 'Additional Details')} ({t('common.optional', 'Optional')})</Text>
            <TextArea
              rows={3}
              value={pauseDetails}
              onChange={(e) => setPauseDetails(e.target.value)}
              placeholder={t('jobs.pause_details_placeholder', 'Provide more details about why you need to pause...')}
              style={{ marginTop: 8 }}
            />
          </div>
        </Space>
      </Modal>
    </Card>
  );
}

export default SmartTimer;
