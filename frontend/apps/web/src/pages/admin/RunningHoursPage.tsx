import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RunningHoursDashboard } from '../../components/equipment';

export const RunningHoursPage: React.FC = () => {
  const navigate = useNavigate();

  const handleEquipmentClick = (equipmentId: number) => {
    navigate(`/equipment/${equipmentId}`);
  };

  return (
    <RunningHoursDashboard onEquipmentClick={handleEquipmentClick} />
  );
};

export default RunningHoursPage;
