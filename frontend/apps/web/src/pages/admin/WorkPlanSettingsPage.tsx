import React, { useState } from 'react';
import { Card, Tabs, Space, Breadcrumb } from 'antd';
import {
  SettingOutlined,
  FileTextOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  JobTemplateManager,
  CapacityConfigManager,
  WorkerSkillsManager,
  EquipmentRestrictionsManager,
} from '../../components/work-planning';

export default function WorkPlanSettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('templates');

  const tabItems = [
    {
      key: 'templates',
      label: (
        <span>
          <FileTextOutlined />
          {t('workPlan.jobTemplates', 'Job Templates')}
        </span>
      ),
      children: <JobTemplateManager />,
    },
    {
      key: 'capacity',
      label: (
        <span>
          <ClockCircleOutlined />
          {t('workPlan.capacityRules', 'Capacity Rules')}
        </span>
      ),
      children: <CapacityConfigManager />,
    },
    {
      key: 'skills',
      label: (
        <span>
          <TeamOutlined />
          {t('workPlan.workerSkills', 'Worker Skills')}
        </span>
      ),
      children: <WorkerSkillsManager />,
    },
    {
      key: 'restrictions',
      label: (
        <span>
          <ToolOutlined />
          {t('workPlan.equipmentRestrictions', 'Equipment Restrictions')}
        </span>
      ),
      children: <EquipmentRestrictionsManager />,
    },
  ];

  return (
    <div>
      <Breadcrumb style={{ marginBottom: 16 }}>
        <Breadcrumb.Item>
          <Link to="/admin">{t('nav.admin', 'Admin')}</Link>
        </Breadcrumb.Item>
        <Breadcrumb.Item>{t('workPlan.settings', 'Work Plan Settings')}</Breadcrumb.Item>
      </Breadcrumb>

      <Card
        title={
          <Space>
            <SettingOutlined />
            {t('workPlan.settings', 'Work Plan Settings')}
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
