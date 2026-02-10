import React, { useState } from 'react';
import { Card, Tabs, Button, Space, Breadcrumb } from 'antd';
import {
  SettingOutlined,
  CalendarOutlined,
  FileTextOutlined,
  StopOutlined,
  GiftOutlined,
  DollarOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  LeaveTypeManager,
  LeavePolicyManager,
  LeaveBlackoutManager,
  CompOffList,
  EncashmentList,
} from '../../components/leaves';
import HolidaysManager from '../../components/leaves/HolidaysManager';

export default function LeaveSettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('types');

  const tabItems = [
    {
      key: 'types',
      label: (
        <span>
          <FileTextOutlined />
          {t('leaves.leaveTypes', 'Leave Types')}
        </span>
      ),
      children: <LeaveTypeManager />,
    },
    {
      key: 'policies',
      label: (
        <span>
          <SettingOutlined />
          {t('leaves.policies', 'Policies')}
        </span>
      ),
      children: <LeavePolicyManager />,
    },
    {
      key: 'blackouts',
      label: (
        <span>
          <StopOutlined />
          {t('leaves.blackouts', 'Blackout Periods')}
        </span>
      ),
      children: <LeaveBlackoutManager />,
    },
    {
      key: 'holidays',
      label: (
        <span>
          <CalendarOutlined />
          {t('leaves.holidays', 'Holidays')}
        </span>
      ),
      children: <HolidaysManager />,
    },
    {
      key: 'compoff',
      label: (
        <span>
          <GiftOutlined />
          {t('leaves.compensatory', 'Comp-Off')}
        </span>
      ),
      children: <CompOffList showAdminActions />,
    },
    {
      key: 'encashment',
      label: (
        <span>
          <DollarOutlined />
          {t('leaves.encashment', 'Encashment')}
        </span>
      ),
      children: <EncashmentList showAdminActions />,
    },
  ];

  return (
    <div>
      <Breadcrumb style={{ marginBottom: 16 }}>
        <Breadcrumb.Item>
          <Link to="/admin">{t('nav.admin', 'Admin')}</Link>
        </Breadcrumb.Item>
        <Breadcrumb.Item>{t('leaves.settings', 'Leave Settings')}</Breadcrumb.Item>
      </Breadcrumb>

      <Card
        title={
          <Space>
            <SettingOutlined />
            {t('leaves.settings', 'Leave Settings')}
          </Space>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="large"
        />
      </Card>
    </div>
  );
}
