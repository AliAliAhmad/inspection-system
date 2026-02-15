import React from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { RunningHoursDashboard } from '../../components/equipment';

export const RunningHoursPage: React.FC = () => {
  const navigate = useNavigate();

  const handleEquipmentClick = (equipmentId: number) => {
    navigate(`/equipment/${equipmentId}`);
  };

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Equipment Running Hours"
        emoji="⏱️"
        breadcrumbs={[
          { title: 'Equipment', path: '/admin/equipment' },
          { title: 'Running Hours' },
        ]}
      />

      <RunningHoursDashboard onEquipmentClick={handleEquipmentClick} />
    </div>
  );
};

export default RunningHoursPage;
