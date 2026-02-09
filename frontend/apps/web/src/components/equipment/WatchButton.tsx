import React, { useState } from 'react';
import {
  Button,
  Tooltip,
  Dropdown,
  Space,
  Switch,
  Typography,
  Divider,
  Spin,
  message,
} from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  BellOutlined,
  SettingOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { equipmentApi } from '@inspection/shared';
import type { EquipmentWatch, WatchPreferences } from '@inspection/shared';

const { Text } = Typography;

interface WatchButtonProps {
  equipmentId: number;
  size?: 'small' | 'middle' | 'large';
  showLabel?: boolean;
}

export const WatchButton: React.FC<WatchButtonProps> = ({
  equipmentId,
  size = 'middle',
  showLabel = true,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const queryClient = useQueryClient();

  const { data: watchStatus, isLoading } = useQuery({
    queryKey: ['equipment-watch-status', equipmentId],
    queryFn: async () => {
      const response = await equipmentApi.getWatchStatus(equipmentId);
      return response.data?.data as { is_watching: boolean; watch: EquipmentWatch | null };
    },
  });

  const watchMutation = useMutation({
    mutationFn: (preferences?: WatchPreferences) => equipmentApi.watch(equipmentId, preferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-watch-status', equipmentId] });
      message.success('Now watching this equipment');
    },
    onError: () => message.error('Failed to watch equipment'),
  });

  const unwatchMutation = useMutation({
    mutationFn: () => equipmentApi.unwatch(equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-watch-status', equipmentId] });
      message.success('Stopped watching this equipment');
    },
    onError: () => message.error('Failed to unwatch equipment'),
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (preferences: WatchPreferences) => equipmentApi.watch(equipmentId, preferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-watch-status', equipmentId] });
      message.success('Notification preferences updated');
    },
    onError: () => message.error('Failed to update preferences'),
  });

  const handleToggleWatch = () => {
    if (watchStatus?.is_watching) {
      unwatchMutation.mutate();
    } else {
      watchMutation.mutate(undefined);
    }
  };

  const handlePreferenceChange = (key: keyof WatchPreferences, value: boolean) => {
    const currentWatch = watchStatus?.watch;
    const newPrefs: WatchPreferences = {
      notify_status_change: currentWatch?.notify_status_change ?? true,
      notify_high_risk: currentWatch?.notify_high_risk ?? true,
      notify_anomaly: currentWatch?.notify_anomaly ?? true,
      notify_maintenance: currentWatch?.notify_maintenance ?? true,
      [key]: value,
    };
    updatePreferencesMutation.mutate(newPrefs);
  };

  if (isLoading) {
    return <Spin size="small" />;
  }

  const isWatching = watchStatus?.is_watching || false;
  const watch = watchStatus?.watch;

  const settingsContent = (
    <div style={{ padding: 16, minWidth: 250 }}>
      <div style={{ marginBottom: 12 }}>
        <Text strong>Notification Settings</Text>
      </div>
      <Divider style={{ margin: '12px 0' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>Status Changes</Text>
          <Switch
            size="small"
            checked={watch?.notify_status_change ?? true}
            onChange={(checked) => handlePreferenceChange('notify_status_change', checked)}
            disabled={!isWatching}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>High Risk Alerts</Text>
          <Switch
            size="small"
            checked={watch?.notify_high_risk ?? true}
            onChange={(checked) => handlePreferenceChange('notify_high_risk', checked)}
            disabled={!isWatching}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>Anomaly Detection</Text>
          <Switch
            size="small"
            checked={watch?.notify_anomaly ?? true}
            onChange={(checked) => handlePreferenceChange('notify_anomaly', checked)}
            disabled={!isWatching}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>Maintenance Alerts</Text>
          <Switch
            size="small"
            checked={watch?.notify_maintenance ?? true}
            onChange={(checked) => handlePreferenceChange('notify_maintenance', checked)}
            disabled={!isWatching}
          />
        </div>
      </div>
      {!isWatching && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Watch this equipment to customize notification preferences.
          </Text>
        </>
      )}
    </div>
  );

  if (!showLabel) {
    return (
      <Tooltip title={isWatching ? 'Watching - Click to unwatch' : 'Watch for notifications'}>
        <Button
          type={isWatching ? 'primary' : 'default'}
          icon={isWatching ? <EyeOutlined /> : <EyeInvisibleOutlined />}
          onClick={handleToggleWatch}
          loading={watchMutation.isPending || unwatchMutation.isPending}
          size={size}
        />
      </Tooltip>
    );
  }

  return (
    <Dropdown
      dropdownRender={() => settingsContent}
      trigger={['click']}
      open={showSettings}
      onOpenChange={setShowSettings}
    >
      <Button
        type={isWatching ? 'primary' : 'default'}
        size={size}
        loading={watchMutation.isPending || unwatchMutation.isPending}
      >
        <Space>
          {isWatching ? <EyeOutlined /> : <EyeInvisibleOutlined />}
          {isWatching ? 'Watching' : 'Watch'}
          <DownOutlined style={{ fontSize: 10 }} />
        </Space>
      </Button>
    </Dropdown>
  );
};

// Simple toggle button variant
export const WatchToggleButton: React.FC<WatchButtonProps> = ({
  equipmentId,
  size = 'middle',
  showLabel = false,
}) => {
  const queryClient = useQueryClient();

  const { data: watchStatus, isLoading } = useQuery({
    queryKey: ['equipment-watch-status', equipmentId],
    queryFn: async () => {
      const response = await equipmentApi.getWatchStatus(equipmentId);
      return response.data?.data as { is_watching: boolean; watch: EquipmentWatch | null };
    },
  });

  const watchMutation = useMutation({
    mutationFn: () => equipmentApi.watch(equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-watch-status', equipmentId] });
      message.success('Now watching this equipment');
    },
    onError: () => message.error('Failed to watch equipment'),
  });

  const unwatchMutation = useMutation({
    mutationFn: () => equipmentApi.unwatch(equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-watch-status', equipmentId] });
      message.success('Stopped watching');
    },
    onError: () => message.error('Failed to unwatch'),
  });

  const handleToggle = () => {
    if (watchStatus?.is_watching) {
      unwatchMutation.mutate();
    } else {
      watchMutation.mutate();
    }
  };

  if (isLoading) {
    return <Spin size="small" />;
  }

  const isWatching = watchStatus?.is_watching || false;

  return (
    <Tooltip title={isWatching ? 'Stop watching' : 'Watch for notifications'}>
      <Button
        type={isWatching ? 'primary' : 'text'}
        icon={isWatching ? <BellOutlined /> : <EyeOutlined />}
        onClick={handleToggle}
        loading={watchMutation.isPending || unwatchMutation.isPending}
        size={size}
      >
        {showLabel && (isWatching ? 'Watching' : 'Watch')}
      </Button>
    </Tooltip>
  );
};

export default WatchButton;
