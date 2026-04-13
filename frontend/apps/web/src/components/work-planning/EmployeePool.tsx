import React, { useMemo, useState } from 'react';
import { Avatar, Tooltip, Spin, Badge, Tag, Button } from 'antd';
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { usersApi, rosterApi, leavesApi } from '@inspection/shared';

// Role config
const ROLE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  engineer: { label: 'Engineers', emoji: '🔧', color: '#1890ff' },
  specialist: { label: 'Specialists', emoji: '🔨', color: '#52c41a' },
  inspector: { label: 'Inspectors', emoji: '🔍', color: '#722ed1' },
  maintenance: { label: 'Maintenance', emoji: '🛠️', color: '#fa8c16' },
  technician: { label: 'Technicians', emoji: '👷', color: '#13c2c2' },
  quality_engineer: { label: 'Quality Engineers', emoji: '✅', color: '#eb2f96' },
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
  assignedHours?: number;
  maxHours?: number;
}

const DraggableEmployeeInner: React.FC<DraggableEmployeeProps> = ({ user, isOnLeave, assignedHours = 0, maxHours = 40 }) => {
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

  const workloadPercent = Math.min((assignedHours / maxHours) * 100, 100);
  const workloadColor = workloadPercent > 80 ? '#ff4d4f' : workloadPercent > 50 ? '#faad14' : '#52c41a';

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : isOnLeave ? 0.5 : 1,
    cursor: isOnLeave ? 'not-allowed' : 'grab',
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '4px 8px',
    backgroundColor: isDragging ? '#e6f7ff' : isOnLeave ? '#f5f5f5' : '#fff',
    border: `1px ${isOnLeave ? 'dashed' : 'solid'} #d9d9d9`,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 4,
    textDecoration: isOnLeave ? 'line-through' : 'none',
    minWidth: 60,
  };

  const tooltipText = isOnLeave
    ? `${user.full_name} - On Leave`
    : `${user.full_name}\n${assignedHours}h assigned this week`;

  return (
    <Tooltip title={tooltipText}>
      <div ref={setNodeRef} style={style} {...(isOnLeave ? {} : { ...listeners, ...attributes })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Avatar
            size={18}
            style={{
              backgroundColor: isOnLeave ? '#d9d9d9' : ROLE_CONFIG[user.role]?.color || '#1890ff',
              fontSize: 9,
            }}
          >
            {initials}
          </Avatar>
          <span style={{ fontSize: 11, color: isOnLeave ? '#8c8c8c' : '#262626', fontWeight: 500 }}>
            {user.full_name?.split(' ')[0]}
          </span>
          {isOnLeave && <span style={{ fontSize: 9 }}>🏖️</span>}
        </div>
        {!isOnLeave && assignedHours > 0 && (
          <div style={{ width: '100%', marginTop: 2 }}>
            <div style={{
              height: 3,
              backgroundColor: '#f0f0f0',
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${workloadPercent}%`,
                height: '100%',
                backgroundColor: workloadColor,
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: 9, color: '#8c8c8c', textAlign: 'center', marginTop: 1 }}>
              {assignedHours}h
            </div>
          </div>
        )}
      </div>
    </Tooltip>
  );
};

const DraggableEmployee = React.memo(DraggableEmployeeInner);

interface EmployeePoolProps {
  weekStart?: string;
  jobs?: any[]; // All jobs from current plan to calculate workload
  onRefresh?: () => void;
  /** When true, renders in a vertical single-column layout for sidebar use */
  vertical?: boolean;
}

export const EmployeePool: React.FC<EmployeePoolProps> = ({ weekStart, jobs = [], onRefresh, vertical = false }) => {
  const [berthFilter, setBerthFilter] = useState<'all' | 'east' | 'west'>('all');
  // Fetch users
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ is_active: true, per_page: 500 }).then(r => r.data.data),
    staleTime: 60000, // Cache for 60 seconds
    refetchOnWindowFocus: false,
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
    staleTime: 60000, // Cache for 60 seconds
    refetchOnWindowFocus: false,
  });

  // Get users on leave
  const leaveUserIds = useMemo(() => {
    const ids = new Set<number>();
    if (rosterData?.users) {
      rosterData.users.forEach((u: any) => {
        // Check if user has any leave status in their entries
        const entries = u.entries || {};
        const hasLeave = Object.values(entries).some(status => status === 'leave');
        if (hasLeave || u.is_on_leave) ids.add(u.id);
      });
    }
    return ids;
  }, [rosterData]);

  // Calculate assigned hours per user
  const userHoursMap = useMemo(() => {
    const hoursMap = new Map<number, number>();
    jobs.forEach((job: any) => {
      const hours = job.estimated_hours || 0;
      (job.assignments || []).forEach((assignment: any) => {
        const userId = assignment.user_id;
        hoursMap.set(userId, (hoursMap.get(userId) || 0) + hours);
      });
    });
    return hoursMap;
  }, [jobs]);

  // Group users by role -> specialization
  const groupedUsers = useMemo(() => {
    const groups: Record<string, Record<string, any[]>> = {};

    const users = usersData || [];
    users.forEach((user: any) => {
      if (user.role === 'admin') return;
      const role = user.role || 'other';
      const spec = user.specialization?.toLowerCase() || 'other';

      if (!groups[role]) {
        groups[role] = { mechanical: [], electrical: [], hvac: [], other: [] };
      }
      if (groups[role][spec]) {
        groups[role][spec].push(user);
      } else {
        groups[role].other.push(user);
      }
    });

    return groups;
  }, [usersData]);

  // Ordered list of roles to display (known roles first, then any extras)
  const displayRoles = useMemo(() => {
    const knownOrder = ['engineer', 'specialist', 'inspector', 'maintenance', 'technician', 'quality_engineer'];
    const roles = Object.keys(groupedUsers);
    const ordered = knownOrder.filter(r => roles.includes(r));
    const extras = roles.filter(r => !knownOrder.includes(r));
    return [...ordered, ...extras];
  }, [groupedUsers]);

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

  // Calculate totals
  const totalUsers = useMemo(() => {
    let total = 0;
    let available = 0;
    let onLeave = 0;
    Object.values(groupedUsers).forEach(specs => {
      Object.values(specs).forEach((users: any[]) => {
        total += users.length;
        users.forEach(u => {
          if (leaveUserIds.has(u.id)) {
            onLeave++;
          } else {
            available++;
          }
        });
      });
    });
    return { total, available, onLeave };
  }, [groupedUsers, leaveUserIds]);

  // Calculate total assigned hours
  const totalAssignedHours = useMemo(() => {
    let total = 0;
    userHoursMap.forEach(hours => total += hours);
    return total;
  }, [userHoursMap]);

  // User IDs assigned to jobs on the selected berth (for berth filter)
  const berthUserIds = useMemo(() => {
    if (berthFilter === 'all') return null; // null = show all
    const ids = new Set<number>();
    jobs.forEach((job: any) => {
      const jb = (job.berth || '').toLowerCase();
      if (jb === berthFilter || jb === 'both') {
        (job.assignments || []).forEach((a: any) => {
          if (a.user_id) ids.add(a.user_id);
        });
      }
    });
    return ids;
  }, [berthFilter, jobs]);

  // Get users on leave for display
  const usersOnLeave = useMemo(() => {
    const users: any[] = [];
    Object.values(groupedUsers).forEach(specs => {
      Object.values(specs).forEach((specUsers: any[]) => {
        specUsers.forEach(u => {
          if (leaveUserIds.has(u.id)) {
            users.push(u);
          }
        });
      });
    });
    return users;
  }, [groupedUsers, leaveUserIds]);

  return (
    <div
      style={vertical ? {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      } : {
        background: '#fafafa',
        border: '1px solid #e8e8e8',
        borderRadius: 8,
        padding: 12,
        marginTop: 12,
      }}
    >
      {/* Header with Summary */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        ...(vertical
          ? { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', backgroundColor: '#fafafa', flexShrink: 0 }
          : { marginBottom: 10 }),
      }}>
        <div style={{ display: 'flex', alignItems: vertical ? 'flex-start' : 'center', gap: vertical ? 6 : 16, flexDirection: vertical ? 'column' : 'row' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#595959' }}>
            👥 Team Pool {!vertical && <span style={{ fontWeight: 400, color: '#8c8c8c' }}>- Drag to assign</span>}
          </span>
          {/* Quick Stats */}
          <div style={{ display: 'flex', gap: vertical ? 4 : 12, fontSize: 11, flexWrap: 'wrap', alignItems: 'center' }}>
            <Tag color="green" style={{ margin: 0 }}>✅ {totalUsers.available}</Tag>
            {totalUsers.onLeave > 0 && (
              <Tag color="orange" style={{ margin: 0 }}>🏖️ {totalUsers.onLeave}</Tag>
            )}
            <Tag color="blue" style={{ margin: 0 }}>⏱️ {totalAssignedHours}h</Tag>
            {/* Berth filter */}
            <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
              {(['all', 'east', 'west'] as const).map(b => (
                <Button
                  key={b}
                  size="small"
                  type={berthFilter === b ? 'primary' : 'default'}
                  onClick={() => setBerthFilter(b)}
                  style={{ fontSize: 10, minWidth: 0, padding: '0 6px', height: 22 }}
                >
                  {b === 'all' ? 'All' : b === 'east' ? 'East' : 'West'}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <Tooltip title="Refresh">
          <ReloadOutlined
            onClick={handleRefresh}
            style={{ cursor: 'pointer', color: '#1890ff', fontSize: 13 }}
          />
        </Tooltip>
      </div>

      {/* On Leave Warning */}
      {usersOnLeave.length > 0 && (
        <div style={{
          background: '#fff7e6',
          border: '1px solid #ffd591',
          borderRadius: vertical ? 0 : 6,
          padding: '6px 10px',
          ...(vertical ? { flexShrink: 0 } : { marginBottom: 10 }),
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
        }}>
          <WarningOutlined style={{ color: '#fa8c16' }} />
          <span style={{ color: '#ad6800' }}>
            <strong>On leave:</strong> {usersOnLeave.map(u => u.full_name?.split(' ')[0]).join(', ')}
          </span>
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
      ) : vertical ? (
        /* ──── Vertical layout for sidebar ──── */
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {displayRoles.map(role => {
            const config = ROLE_CONFIG[role] || { label: role.charAt(0).toUpperCase() + role.slice(1), emoji: '👤', color: '#8c8c8c' };
            const counts = getRoleCount(role);
            const specs = groupedUsers[role];
            if (counts.total === 0) return null;

            return (
              <div key={role} style={{ marginBottom: 12 }}>
                {/* Role Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span>{config.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: config.color }}>{config.label}</span>
                  <Badge
                    count={`${counts.available}/${counts.total}`}
                    style={{ backgroundColor: config.color, fontSize: 10 }}
                  />
                </div>

                {/* All employees for this role */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {(['mechanical', 'electrical', 'hvac', 'other'] as const).map(spec => {
                    const users = (specs?.[spec] || []).filter((u: any) =>
                      !leaveUserIds.has(u.id) && (berthUserIds === null || berthUserIds.has(u.id))
                    );
                    return users.map((user: any) => (
                      <DraggableEmployee
                        key={user.id}
                        user={user}
                        isOnLeave={false}
                        assignedHours={userHoursMap.get(user.id) || 0}
                      />
                    ));
                  })}
                </div>
              </div>
            );
          })}

          {/* Footer hint */}
          <div style={{ fontSize: 11, color: '#8c8c8c', textAlign: 'center', padding: '8px 0' }}>
            👆 Drag employees onto jobs in calendar
          </div>
        </div>
      ) : (
        /* ──── Horizontal 3-column layout (default) ──── */
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(displayRoles.length, 4)}, 1fr)`, gap: 12 }}>
          {/* Role Columns */}
          {displayRoles.map(role => {
            const config = ROLE_CONFIG[role] || { label: role.charAt(0).toUpperCase() + role.slice(1), emoji: '👤', color: '#8c8c8c' };
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
                  const availableUsers = users.filter(u =>
                    !leaveUserIds.has(u.id) && (berthUserIds === null || berthUserIds.has(u.id))
                  );
                  if (availableUsers.length === 0) return null;
                  const specConfig = SPEC_CONFIG[spec] || { label: spec, emoji: '📋' };

                  return (
                    <div key={spec} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 3 }}>
                        {specConfig.emoji} {specConfig.label}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                        {availableUsers.map(user => (
                          <DraggableEmployee
                            key={user.id}
                            user={user}
                            isOnLeave={false}
                            assignedHours={userHoursMap.get(user.id) || 0}
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
