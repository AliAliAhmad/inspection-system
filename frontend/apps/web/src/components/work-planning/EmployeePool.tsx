import React, { useMemo } from 'react';
import { Card, Tag, Avatar, Tooltip, Empty, Spin, Collapse, Space, Badge } from 'antd';
import { UserOutlined, ReloadOutlined } from '@ant-design/icons';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { usersApi, rosterApi } from '@inspection/shared';
import dayjs from 'dayjs';

// Role config with emojis
const ROLE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  engineer: { label: 'Engineers', emoji: '🔧', color: '#1890ff' },
  specialist: { label: 'Specialists', emoji: '🔨', color: '#52c41a' },
  inspector: { label: 'Inspectors', emoji: '🔍', color: '#722ed1' },
};

// Specialization config
const SPEC_CONFIG: Record<string, { label: string; emoji: string }> = {
  mechanical: { label: 'Mechanical', emoji: '⚙️' },
  electrical: { label: 'Electrical', emoji: '⚡' },
  hvac: { label: 'HVAC', emoji: '❄️' },
};

interface DraggableEmployeeProps {
  user: any;
  isOnLeave: boolean;
}

const DraggableEmployee: React.FC<DraggableEmployeeProps> = ({ user, isOnLeave }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `employee-${user.id}`,
    data: {
      type: 'employee',
      user,
    },
    disabled: isOnLeave,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : isOnLeave ? 0.4 : 1,
    cursor: isOnLeave ? 'not-allowed' : 'grab',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    backgroundColor: isDragging ? '#e6f7ff' : isOnLeave ? '#f5f5f5' : '#fff',
    border: `1px ${isOnLeave ? 'dashed' : 'solid'} ${isOnLeave ? '#d9d9d9' : '#e8e8e8'}`,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    textDecoration: isOnLeave ? 'line-through' : 'none',
  };

  const initials = user.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || '?';

  return (
    <Tooltip title={isOnLeave ? `${user.full_name} - On Leave 🏖️` : `Drag to assign ${user.full_name}`}>
      <div ref={setNodeRef} style={style} {...(isOnLeave ? {} : { ...listeners, ...attributes })}>
        <Avatar
          size="small"
          style={{
            backgroundColor: isOnLeave ? '#d9d9d9' : ROLE_CONFIG[user.role]?.color || '#1890ff',
            fontSize: 10,
          }}
        >
          {initials}
        </Avatar>
        <span style={{ fontSize: 12, fontWeight: 500, color: isOnLeave ? '#8c8c8c' : '#262626' }}>
          {user.full_name?.split(' ')[0]}
        </span>
        {isOnLeave && <span style={{ fontSize: 10 }}>🏖️</span>}
      </div>
    </Tooltip>
  );
};

interface RoleGroupProps {
  role: string;
  users: any[];
  leaveUserIds: Set<number>;
}

const RoleGroup: React.FC<RoleGroupProps> = ({ role, users, leaveUserIds }) => {
  const config = ROLE_CONFIG[role] || { label: role, emoji: '👤', color: '#8c8c8c' };

  // Group by specialization
  const bySpec = useMemo(() => {
    const groups: Record<string, any[]> = {
      mechanical: [],
      electrical: [],
      hvac: [],
      other: [],
    };

    users.forEach(user => {
      const spec = user.specialization?.toLowerCase() || 'other';
      if (groups[spec]) {
        groups[spec].push(user);
      } else {
        groups.other.push(user);
      }
    });

    return groups;
  }, [users]);

  const activeCount = users.filter(u => !leaveUserIds.has(u.id)).length;

  return (
    <Card
      size="small"
      title={
        <Space>
          <span>{config.emoji}</span>
          <span>{config.label}</span>
          <Badge count={activeCount} style={{ backgroundColor: config.color }} />
        </Space>
      }
      style={{ marginBottom: 8 }}
      bodyStyle={{ padding: '8px 12px' }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {Object.entries(bySpec).map(([spec, specUsers]) => {
          if (specUsers.length === 0) return null;
          const specConfig = SPEC_CONFIG[spec] || { label: spec, emoji: '📋' };

          return (
            <div key={spec} style={{ marginRight: 16 }}>
              <div style={{
                fontSize: 11,
                color: '#8c8c8c',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <span>{specConfig.emoji}</span>
                <span>{specConfig.label}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {specUsers.map(user => (
                  <DraggableEmployee
                    key={user.id}
                    user={user}
                    isOnLeave={leaveUserIds.has(user.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

interface EmployeePoolProps {
  weekStart?: string;
  onRefresh?: () => void;
}

export const EmployeePool: React.FC<EmployeePoolProps> = ({ weekStart, onRefresh }) => {
  // Fetch users
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ is_active: true, per_page: 500 }).then(r => r.data.data),
  });

  // Fetch roster for the week to check availability
  const { data: rosterData, isLoading: rosterLoading } = useQuery({
    queryKey: ['roster', weekStart],
    queryFn: async () => {
      if (!weekStart) return { users: [] };
      const response = await rosterApi.getWeek(weekStart);
      return response.data.data;
    },
    enabled: !!weekStart,
  });

  // Get users on leave
  const leaveUserIds = useMemo(() => {
    const ids = new Set<number>();
    if (rosterData?.users) {
      rosterData.users.forEach((u: any) => {
        // Check if user has any leave days this week
        const days = u.days || [];
        const hasLeave = days.some((d: any) => d.status === 'leave' || d.status === 'sick');
        if (hasLeave) {
          ids.add(u.user_id);
        }
      });
    }
    return ids;
  }, [rosterData]);

  // Group users by role
  const usersByRole = useMemo(() => {
    const groups: Record<string, any[]> = {
      engineer: [],
      specialist: [],
      inspector: [],
    };

    const users = usersData || [];
    users.forEach((user: any) => {
      if (user.role === 'admin') return; // Skip admins
      const role = user.role || 'other';
      if (groups[role]) {
        groups[role].push(user);
      }
    });

    return groups;
  }, [usersData]);

  const isLoading = usersLoading || rosterLoading;
  const totalUsers = Object.values(usersByRole).flat().length;
  const availableCount = totalUsers - leaveUserIds.size;

  const handleRefresh = () => {
    refetchUsers();
    onRefresh?.();
  };

  return (
    <Card
      title={
        <Space>
          <span style={{ fontSize: 16 }}>👥</span>
          <span>Employee Pool</span>
          <Badge
            count={`${availableCount}/${totalUsers}`}
            style={{ backgroundColor: '#52c41a' }}
          />
        </Space>
      }
      size="small"
      extra={
        <Space>
          <Tooltip title="Drag employees to jobs to assign">
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>👆 Drag to assign</span>
          </Tooltip>
          <Tooltip title="Refresh">
            <ReloadOutlined
              onClick={handleRefresh}
              style={{ cursor: 'pointer', color: '#1890ff' }}
            />
          </Tooltip>
        </Space>
      }
      style={{ marginTop: 16 }}
      bodyStyle={{ padding: 12 }}
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <Spin />
        </div>
      ) : totalUsers === 0 ? (
        <Empty description="No employees found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div>
          {Object.entries(usersByRole).map(([role, users]) => {
            if (users.length === 0) return null;
            return (
              <RoleGroup
                key={role}
                role={role}
                users={users}
                leaveUserIds={leaveUserIds}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default EmployeePool;
