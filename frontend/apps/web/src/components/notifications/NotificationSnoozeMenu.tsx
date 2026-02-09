import { useState } from 'react';
import { Dropdown, Button, DatePicker, Space, Typography, Divider, message } from 'antd';
import {
  ClockCircleOutlined,
  CloseCircleOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import type { MenuProps } from 'antd';

const { Text } = Typography;

export interface NotificationSnoozeMenuProps {
  snoozedUntil?: string | null;
  onSnooze: (until: string) => void;
  onCancelSnooze?: () => void;
  loading?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function NotificationSnoozeMenu({
  snoozedUntil,
  onSnooze,
  onCancelSnooze,
  loading = false,
  disabled = false,
  children,
}: NotificationSnoozeMenuProps) {
  const { t } = useTranslation();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customDate, setCustomDate] = useState<Dayjs | null>(null);

  const isSnoozed = !!snoozedUntil && dayjs(snoozedUntil).isAfter(dayjs());

  const getSnoozeOptions = () => {
    const now = dayjs();
    const options = [
      {
        key: '1h',
        label: t('notifications.snooze1Hour', '1 hour'),
        time: now.add(1, 'hour'),
      },
      {
        key: '4h',
        label: t('notifications.snooze4Hours', '4 hours'),
        time: now.add(4, 'hours'),
      },
      {
        key: 'tomorrow_9am',
        label: t('notifications.snoozeTomorrow9am', 'Tomorrow 9am'),
        time: now.add(1, 'day').hour(9).minute(0).second(0),
      },
      {
        key: 'monday_9am',
        label: t('notifications.snoozeMonday9am', 'Monday 9am'),
        time: now.day() === 0 ? now.day(1) : now.add(1, 'week').day(1).hour(9).minute(0).second(0),
      },
    ];
    return options;
  };

  const handleSnoozeSelect = (time: Dayjs) => {
    onSnooze(time.toISOString());
    message.success(
      t('notifications.snoozedUntil', 'Snoozed until {{time}}', {
        time: time.format('MMM D, h:mm A'),
      })
    );
  };

  const handleCustomSnooze = () => {
    if (customDate) {
      handleSnoozeSelect(customDate);
      setShowCustomPicker(false);
      setCustomDate(null);
    }
  };

  const handleCancelSnooze = () => {
    onCancelSnooze?.();
    message.success(t('notifications.snoozeCancelled', 'Snooze cancelled'));
  };

  const snoozeOptions = getSnoozeOptions();

  const menuItems: MenuProps['items'] = [
    ...(isSnoozed
      ? [
          {
            key: 'current',
            label: (
              <Space direction="vertical" size={0}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {t('notifications.currentlySnoozedUntil', 'Currently snoozed until')}
                </Text>
                <Text strong>{dayjs(snoozedUntil).format('MMM D, h:mm A')}</Text>
              </Space>
            ),
            disabled: true,
          },
          {
            key: 'cancel',
            icon: <CloseCircleOutlined />,
            label: t('notifications.cancelSnooze', 'Cancel snooze'),
            danger: true,
            onClick: handleCancelSnooze,
          },
          { type: 'divider' as const },
        ]
      : []),
    ...snoozeOptions.map((option) => ({
      key: option.key,
      icon: <ClockCircleOutlined />,
      label: (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>{option.label}</span>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {option.time.format('h:mm A')}
          </Text>
        </Space>
      ),
      onClick: () => handleSnoozeSelect(option.time),
    })),
    { type: 'divider' as const },
    {
      key: 'custom',
      icon: <CalendarOutlined />,
      label: t('notifications.customSnooze', 'Pick a date & time'),
      onClick: () => setShowCustomPicker(true),
    },
  ];

  const dropdownContent = showCustomPicker ? (
    <div style={{ padding: 12, minWidth: 280 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text strong>{t('notifications.selectSnoozeTime', 'Select snooze time')}</Text>
        <DatePicker
          showTime
          format="MMM D, YYYY h:mm A"
          value={customDate}
          onChange={setCustomDate}
          disabledDate={(current) => current && current < dayjs().startOf('day')}
          style={{ width: '100%' }}
        />
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button size="small" onClick={() => setShowCustomPicker(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={handleCustomSnooze}
            disabled={!customDate}
          >
            {t('notifications.snooze', 'Snooze')}
          </Button>
        </Space>
      </Space>
    </div>
  ) : undefined;

  return (
    <Dropdown
      menu={showCustomPicker ? undefined : { items: menuItems }}
      dropdownRender={showCustomPicker ? () => (
        <div style={{
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08)',
        }}>
          {dropdownContent}
        </div>
      ) : undefined}
      trigger={['click']}
      disabled={disabled || loading}
    >
      {children || (
        <Button
          icon={<ClockCircleOutlined />}
          loading={loading}
          disabled={disabled}
          type={isSnoozed ? 'primary' : 'default'}
          ghost={isSnoozed}
        >
          {isSnoozed
            ? t('notifications.snoozed', 'Snoozed')
            : t('notifications.snooze', 'Snooze')}
        </Button>
      )}
    </Dropdown>
  );
}

export default NotificationSnoozeMenu;
