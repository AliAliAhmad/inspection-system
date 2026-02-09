import { useState, useEffect } from 'react';
import {
  Modal,
  Tabs,
  List,
  Switch,
  Checkbox,
  Select,
  TimePicker,
  Button,
  Space,
  Typography,
  Card,
  Divider,
  message,
  Spin,
  Tag,
  Row,
  Col,
  Alert,
} from 'antd';
import {
  BellOutlined,
  MailOutlined,
  MobileOutlined,
  SoundOutlined,
  ClockCircleOutlined,
  SaveOutlined,
  UndoOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  notificationsApi,
  NotificationPreference,
  NotificationSoundType,
  NotificationDigestMode,
  DoNotDisturbSchedule,
} from '@inspection/shared';

const { Title, Text, Paragraph } = Typography;

export interface NotificationPreferencesModalProps {
  open: boolean;
  onClose: () => void;
}

interface PreferenceGroup {
  key: string;
  label: string;
  types: string[];
}

const PREFERENCE_GROUPS: PreferenceGroup[] = [
  {
    key: 'work',
    label: 'Work & Assignments',
    types: [
      'inspection_assigned',
      'specialist_job_assigned',
      'engineer_job_created',
      'defect_assigned',
    ],
  },
  {
    key: 'approvals',
    label: 'Approvals & Reviews',
    types: [
      'leave_requested',
      'leave_approved',
      'leave_rejected',
      'quality_review_pending',
      'bonus_star_requested',
    ],
  },
  {
    key: 'updates',
    label: 'Updates & Completions',
    types: [
      'inspection_submitted',
      'specialist_job_completed',
      'engineer_job_completed',
      'assessment_submitted',
      'work_plan_published',
    ],
  },
  {
    key: 'alerts',
    label: 'Alerts & Notifications',
    types: ['equipment_alert', 'defect_created', 'mention', 'system'],
  },
];

const SOUND_OPTIONS: { value: NotificationSoundType; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'chime', label: 'Chime' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'silent', label: 'Silent' },
];

const DIGEST_OPTIONS: { value: NotificationDigestMode; label: string; description: string }[] = [
  { value: 'instant', label: 'Instant', description: 'Receive notifications immediately' },
  { value: 'hourly', label: 'Hourly Digest', description: 'Bundled every hour' },
  { value: 'daily', label: 'Daily Digest', description: 'Bundled once per day' },
  { value: 'weekly', label: 'Weekly Digest', description: 'Bundled once per week' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export function NotificationPreferencesModal({
  open,
  onClose,
}: NotificationPreferencesModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('channels');
  const [localPreferences, setLocalPreferences] = useState<NotificationPreference[]>([]);
  const [dndSchedule, setDndSchedule] = useState<Partial<DoNotDisturbSchedule>>({
    start_time: '22:00',
    end_time: '08:00',
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    is_active: false,
    allow_critical: true,
  });
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch preferences
  const { data: preferencesData, isLoading: preferencesLoading } = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: () => notificationsApi.getPreferences().then((r) => r.data),
    enabled: open,
  });

  // Fetch DND schedule
  const { data: dndData, isLoading: dndLoading } = useQuery({
    queryKey: ['notifications', 'dnd'],
    queryFn: () => notificationsApi.getDndSchedule().then((r) => r.data),
    enabled: open,
  });

  // Initialize local state from fetched data
  useEffect(() => {
    if (preferencesData?.data) {
      setLocalPreferences(preferencesData.data);
    }
  }, [preferencesData]);

  useEffect(() => {
    if (dndData?.data) {
      setDndSchedule(dndData.data);
    }
  }, [dndData]);

  // Mutations
  const updatePreferenceMutation = useMutation({
    mutationFn: (preference: NotificationPreference) =>
      notificationsApi.updatePreference({
        notification_type: preference.notification_type,
        channels: preference.channels,
        is_enabled: preference.is_enabled,
        sound_type: preference.sound_type,
        digest_mode: preference.digest_mode,
      }),
  });

  const updateDndMutation = useMutation({
    mutationFn: (schedule: Partial<DoNotDisturbSchedule>) =>
      notificationsApi.setDndSchedule({
        start_time: schedule.start_time!,
        end_time: schedule.end_time!,
        days_of_week: schedule.days_of_week!,
        allow_critical: schedule.allow_critical,
      }),
  });

  const resetPreferencesMutation = useMutation({
    mutationFn: () => notificationsApi.resetPreferences(),
    onSuccess: () => {
      message.success(t('notifications.preferencesReset', 'Preferences reset to defaults'));
      queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
    },
  });

  const handlePreferenceChange = (
    type: string,
    field: keyof NotificationPreference | 'channels',
    value: any
  ) => {
    setLocalPreferences((prev) => {
      const updated = prev.map((p) => {
        if (p.notification_type === type) {
          if (field === 'channels') {
            return { ...p, channels: { ...p.channels, ...value } };
          }
          return { ...p, [field]: value };
        }
        return p;
      });
      return updated;
    });
    setHasChanges(true);
  };

  const handleDndChange = (field: keyof DoNotDisturbSchedule, value: any) => {
    setDndSchedule((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      // Save all preference changes
      await Promise.all(
        localPreferences.map((pref) => updatePreferenceMutation.mutateAsync(pref))
      );

      // Save DND schedule
      if (dndSchedule.start_time && dndSchedule.end_time && dndSchedule.days_of_week) {
        await updateDndMutation.mutateAsync(dndSchedule);
      }

      message.success(t('notifications.preferencesSaved', 'Preferences saved successfully'));
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setHasChanges(false);
    } catch (error) {
      message.error(t('common.error', 'An error occurred'));
    }
  };

  const getPreferenceByType = (type: string) => {
    return (
      localPreferences.find((p) => p.notification_type === type) || {
        notification_type: type,
        channels: { in_app: true, email: false, sms: false, push: false },
        is_enabled: true,
        sound_type: 'default' as NotificationSoundType,
        digest_mode: 'instant' as NotificationDigestMode,
      }
    );
  };

  const renderChannelsTab = () => (
    <div>
      <Alert
        message={t('notifications.channelsInfo', 'Choose how you want to receive each type of notification')}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {PREFERENCE_GROUPS.map((group) => (
        <Card
          key={group.key}
          size="small"
          title={group.label}
          style={{ marginBottom: 16 }}
        >
          <List
            size="small"
            dataSource={group.types}
            renderItem={(type) => {
              const pref = getPreferenceByType(type);
              const typeLabel = type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

              return (
                <List.Item
                  actions={[
                    <Space key="channels" size="middle">
                      <Checkbox
                        checked={pref.channels.in_app}
                        onChange={(e) =>
                          handlePreferenceChange(type, 'channels', { in_app: e.target.checked })
                        }
                        disabled={!pref.is_enabled}
                      >
                        <BellOutlined />
                      </Checkbox>
                      <Checkbox
                        checked={pref.channels.email}
                        onChange={(e) =>
                          handlePreferenceChange(type, 'channels', { email: e.target.checked })
                        }
                        disabled={!pref.is_enabled}
                      >
                        <MailOutlined />
                      </Checkbox>
                      <Checkbox
                        checked={pref.channels.push}
                        onChange={(e) =>
                          handlePreferenceChange(type, 'channels', { push: e.target.checked })
                        }
                        disabled={!pref.is_enabled}
                      >
                        <MobileOutlined />
                      </Checkbox>
                    </Space>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Switch
                          size="small"
                          checked={pref.is_enabled}
                          onChange={(checked) => handlePreferenceChange(type, 'is_enabled', checked)}
                        />
                        <Text style={{ opacity: pref.is_enabled ? 1 : 0.5 }}>{typeLabel}</Text>
                      </Space>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </Card>
      ))}
    </div>
  );

  const renderSoundTab = () => (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {t('notifications.soundInfo', 'Choose the notification sound for each priority level')}
      </Paragraph>

      <List
        dataSource={['critical', 'urgent', 'warning', 'info']}
        renderItem={(priority) => {
          const defaultPrefs = localPreferences.find(
            (p) => p.notification_type === `${priority}_default`
          );
          return (
            <List.Item
              actions={[
                <Select
                  key="sound"
                  value={defaultPrefs?.sound_type || 'default'}
                  options={SOUND_OPTIONS}
                  style={{ width: 120 }}
                  onChange={(value) => {
                    // Update all preferences of this priority
                    localPreferences.forEach((p) => {
                      handlePreferenceChange(p.notification_type, 'sound_type', value);
                    });
                  }}
                />,
              ]}
            >
              <List.Item.Meta
                title={
                  <Tag
                    color={
                      priority === 'critical'
                        ? 'magenta'
                        : priority === 'urgent'
                          ? 'red'
                          : priority === 'warning'
                            ? 'orange'
                            : 'blue'
                    }
                  >
                    {priority.toUpperCase()}
                  </Tag>
                }
                description={`Sound for ${priority} priority notifications`}
              />
            </List.Item>
          );
        }}
      />
    </div>
  );

  const renderDigestTab = () => (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {t('notifications.digestInfo', 'Choose how often you want to receive notification summaries')}
      </Paragraph>

      <Row gutter={[16, 16]}>
        {DIGEST_OPTIONS.map((option) => (
          <Col key={option.value} xs={24} sm={12}>
            <Card
              hoverable
              style={{
                borderColor:
                  localPreferences[0]?.digest_mode === option.value ? '#1677ff' : undefined,
              }}
              onClick={() => {
                localPreferences.forEach((p) => {
                  handlePreferenceChange(p.notification_type, 'digest_mode', option.value);
                });
              }}
            >
              <Title level={5} style={{ marginBottom: 4 }}>
                {option.label}
              </Title>
              <Text type="secondary">{option.description}</Text>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );

  const renderDndTab = () => (
    <div>
      <Alert
        message={t('notifications.dndInfo', 'Set quiet hours when you don\'t want to be disturbed')}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Title level={5} style={{ marginBottom: 0 }}>
                <ClockCircleOutlined /> {t('notifications.doNotDisturb', 'Do Not Disturb')}
              </Title>
              <Text type="secondary">
                {t('notifications.dndDescription', 'Pause non-critical notifications during quiet hours')}
              </Text>
            </div>
            <Switch
              checked={dndSchedule.is_active}
              onChange={(checked) => handleDndChange('is_active', checked)}
            />
          </div>

          {dndSchedule.is_active && (
            <>
              <Divider style={{ margin: '12px 0' }} />

              <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {t('notifications.quietHours', 'Quiet Hours')}
                </Text>
                <Space>
                  <TimePicker
                    value={dndSchedule.start_time ? dayjs(dndSchedule.start_time, 'HH:mm') : null}
                    format="HH:mm"
                    onChange={(time) =>
                      handleDndChange('start_time', time?.format('HH:mm') || '22:00')
                    }
                    placeholder="Start"
                  />
                  <Text>to</Text>
                  <TimePicker
                    value={dndSchedule.end_time ? dayjs(dndSchedule.end_time, 'HH:mm') : null}
                    format="HH:mm"
                    onChange={(time) =>
                      handleDndChange('end_time', time?.format('HH:mm') || '08:00')
                    }
                    placeholder="End"
                  />
                </Space>
              </div>

              <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {t('notifications.dndDays', 'Active Days')}
                </Text>
                <Checkbox.Group
                  value={dndSchedule.days_of_week}
                  onChange={(values) => handleDndChange('days_of_week', values)}
                >
                  <Space>
                    {DAYS_OF_WEEK.map((day) => (
                      <Checkbox key={day.value} value={day.value}>
                        {day.label}
                      </Checkbox>
                    ))}
                  </Space>
                </Checkbox.Group>
              </div>

              <div>
                <Checkbox
                  checked={dndSchedule.allow_critical}
                  onChange={(e) => handleDndChange('allow_critical', e.target.checked)}
                >
                  <Text>
                    {t('notifications.allowCritical', 'Allow critical notifications during quiet hours')}
                  </Text>
                </Checkbox>
              </div>
            </>
          )}
        </Space>
      </Card>
    </div>
  );

  const isLoading = preferencesLoading || dndLoading;
  const isSaving = updatePreferenceMutation.isPending || updateDndMutation.isPending;

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined />
          {t('notifications.preferencesTitle', 'Notification Preferences')}
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={700}
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button
            icon={<UndoOutlined />}
            onClick={() => resetPreferencesMutation.mutate()}
            loading={resetPreferencesMutation.isPending}
          >
            {t('notifications.resetToDefaults', 'Reset to Defaults')}
          </Button>
          <Space>
            <Button onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={isSaving}
              disabled={!hasChanges}
            >
              {t('common.save', 'Save')}
            </Button>
          </Space>
        </Space>
      }
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'channels',
              label: (
                <Space>
                  <BellOutlined />
                  {t('notifications.tabChannels', 'Channels')}
                </Space>
              ),
              children: renderChannelsTab(),
            },
            {
              key: 'sound',
              label: (
                <Space>
                  <SoundOutlined />
                  {t('notifications.tabSound', 'Sound')}
                </Space>
              ),
              children: renderSoundTab(),
            },
            {
              key: 'digest',
              label: (
                <Space>
                  <MailOutlined />
                  {t('notifications.tabDigest', 'Digest')}
                </Space>
              ),
              children: renderDigestTab(),
            },
            {
              key: 'dnd',
              label: (
                <Space>
                  <ClockCircleOutlined />
                  {t('notifications.tabDnd', 'Quiet Hours')}
                </Space>
              ),
              children: renderDndTab(),
            },
          ]}
        />
      )}
    </Modal>
  );
}

export default NotificationPreferencesModal;
