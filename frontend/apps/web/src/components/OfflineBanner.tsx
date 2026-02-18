/**
 * Offline Banner Component
 * Shows connection status and pending sync operations.
 */
import React from 'react';
import { Alert, Button, Space, Badge } from 'antd';
import { WifiOutlined, SyncOutlined, CloudSyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useOffline } from '../providers/OfflineProvider';

export function OfflineBanner() {
  const { t } = useTranslation();
  const { isOnline, isSyncing, pendingCount, triggerSync } = useOffline();

  // Don't show if online and no pending changes
  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  const bannerStyle = { marginBottom: 0, padding: '10px 16px', fontSize: 15, fontWeight: 700 } as React.CSSProperties;

  // Offline state
  if (!isOnline) {
    return (
      <Alert
        banner
        type="warning"
        icon={<WifiOutlined style={{ fontSize: 18 }} />}
        message={
          <Space>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t('common.offline')}</span>
            {pendingCount > 0 && (
              <Badge
                count={pendingCount}
                style={{ backgroundColor: '#faad14' }}
                title={`${pendingCount} ${t('common.unsyncedChanges')}`}
              />
            )}
          </Space>
        }
        style={bannerStyle}
      />
    );
  }

  // Syncing state
  if (isSyncing) {
    return (
      <Alert
        banner
        type="info"
        icon={<SyncOutlined spin style={{ fontSize: 18 }} />}
        message={<span style={{ fontSize: 15, fontWeight: 700 }}>{t('common.syncing')}</span>}
        style={bannerStyle}
      />
    );
  }

  // Online with pending changes
  if (pendingCount > 0) {
    return (
      <Alert
        banner
        type="warning"
        icon={<CloudSyncOutlined style={{ fontSize: 18 }} />}
        message={
          <Space>
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              {pendingCount} {t('common.unsyncedChanges')}
            </span>
            <Button size="small" type="primary" onClick={triggerSync}>
              Sync Now
            </Button>
          </Space>
        }
        style={bannerStyle}
      />
    );
  }

  return null;
}

export default OfflineBanner;
