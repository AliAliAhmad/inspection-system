import React, { useMemo } from 'react';
import { Avatar, Tooltip, Spin, Badge } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { usersApi, rosterApi } from '@inspection/shared';

// Role config
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
    data: { type: 'employee', user },
    disabled: isOnLeave,
  });

  const initials = user.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || '?';

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : isOnLeave ? 0.5 : 1,
    cursor: isOnLeave ? 'not-allowed' : 'grab',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    backgroundColor: isDragging ? '#e6f7ff' : isOnLeave ? '#f5f5f5' : '#fff',
    border: `1px ${isOnLeave ? 'dashed' : 'solid'} #d9d9d9`,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
    textDecoration: isOnLeave ? 'line-through' : 'none',
  };

  return (
    <Tooltip title={isOnLeave ? `${user.full_name} - On Leave` : `Drag to assign ${user.full_name}`}>
      <div ref={setNodeRef} style={style} {...(isOnLeave ? {} : { ...listeners, ...attributes })}>
        <Avatar
          size={16}
          style={{
            backgroundColor: isOnLeave ? '#d9d9d9' : ROLE_CONFIG[user.role]?.color || '#1890ff',
            fontSize: 8,
          }}
        >
          {initials}
        </Avatar>
        <span style={{ fontSize: 11, color: isOnLeave ? '#8c8c8c' : '#262626' }}>
          {user.full_name?.split(' ')[0]}
        </span>
        {isOnLeave && <span style={{ fontSize: 9 }}>🏖️</span>}
      </div>
    </Tooltip>
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

  // Fetch roster for the week
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
        const days = u.days || [];
        const hasLeave = days.some((d: any) => d.status === 'leave' || d.status === 'sick');
        if (hasLeave) ids.add(u.user_id);
      });
    }
    return ids;
  }, [rosterData]);

  // Group users by role -> specialization
  const groupedUsers = useMemo(() => {
    const groups: Record<string, Record<string, any[]>> = {
      engineer: { mechanical: [], electrical: [], hvac: [], other: [] },
      specialist: { mechanical: [], electrical: [], hvac: [], other: [] },
      inspector: { mechanical: [], electrical: [], hvac: [], other: [] },
    };

    const users = usersData || [];
    users.forEach((user: any) => {
      if (user.role === 'admin') return;
      const role = user.role || 'other';
      const spec = user.specialization?.toLowerCase() || 'other';

      if (groups[role]) {
        if (groups[role][spec]) {
          groups[role][spec].push(user);
        } else {
          groups[role].other.push(user);
        }
      }
    });

    return groups;
  }, [usersData]);

  const isLoading = usersLoading || rosterLoading;

  const handleRefresh = () => {
    refetchUsers();
    onRefresh?.();
  };

  // Count available per role
  const getRoleCount = (role: string) => {
    const specs = groupedUsers[role] || {};
    const all = Object.values(specs).flat();
    const available = all.filter(u => !leaveUserIds.has(u.id)).length;
    return { available, total: all.length };
  };

  return (
    <div
      style={{
        background: '#fafafa',
        border: '1px solid #e8e8e8',
        borderRadius: 8,
        padding: 12,
        marginTop: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#595959' }}>
          👥 Team Pool <span style={{ fontWeight: 400, color: '#8c8c8c' }}>- Drag to assign</span>
        </span>
        <Tooltip title="Refresh">
          <ReloadOutlined
            onClick={handleRefresh}
            style={{ cursor: 'pointer', color: '#1890ff', fontSize: 13 }}
          />
        </Tooltip>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {/* Role Columns */}
          {(['engineer', 'specialist', 'inspector'] as const).map(role => {
            const config = ROLE_CONFIG[role];
            const counts = getRoleCount(role);
            const specs = groupedUsers[role];

            return (
              <div
                key={role}
                style={{
                  background: '#fff',
                  border: '1px solid #e8e8e8',
                  borderRadius: 6,
                  padding: 10,
                }}
              >
                {/* Role Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span>{config.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: config.color }}>{config.label}</span>
                  <Badge
                    count={`${counts.available}/${counts.total}`}
                    style={{ backgroundColor: config.color, fontSize: 10 }}
                  />
                </div>

                {/* Specialization Groups */}
                {(['mechanical', 'electrical', 'hvac', 'other'] as const).map(spec => {
                  const users = specs[spec] || [];
                  if (users.length === 0) return null;
                  const specConfig = SPEC_CONFIG[spec] || { label: spec, emoji: '📋' };

                  return (
                    <div key={spec} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 3 }}>
                        {specConfig.emoji} {specConfig.label}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                        {users.map(user => (
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

                {counts.total === 0 && (
                  <div style={{ color: '#bfbfbf', fontSize: 11, textAlign: 'center', padding: 10 }}>
                    No {config.label.toLowerCase()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EmployeePool;
