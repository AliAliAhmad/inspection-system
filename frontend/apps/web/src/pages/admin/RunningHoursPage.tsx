import React from 'react';
import { Typography, Breadcrumb } from 'antd';
import { DashboardOutlined, HomeOutlined, SettingOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { RunningHoursDashboard } from '../../components/equipment';

const { Title } = Typography;

export const RunningHoursPage: React.FC = () => {
  const navigate = useNavigate();

  const handleEquipmentClick = (equipmentId: number) => {
    navigate(`/equipment/${equipmentId}`);
  };

  return (
    <div style={{ padding: '24px' }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          {
            title: (
              <Link to="/">
                <HomeOutlined /> Home
              </Link>
            ),
          },
          {
            title: (
              <Link to="/equipment">
                <SettingOutlined /> Equipment
              </Link>
            ),
          },
          {
            title: (
              <>
                <DashboardOutlined /> Running Hours
              </>
            ),
          },
        ]}
      />

      <PageHeader
        title="Equipment Running Hours"
        subtitle="Track equipment operating hours and service schedules"
        icon={<DashboardOutlined />}
      />

      <RunningHoursDashboard onEquipmentClick={handleEquipmentClick} />
    </div>
  );
};

export default RunningHoursPage;
