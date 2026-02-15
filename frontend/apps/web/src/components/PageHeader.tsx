import { Breadcrumb, Typography, Space } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const { Title } = Typography;

interface BreadcrumbItem {
  title: string;
  path?: string;
}

interface PageHeaderProps {
  title: string;
  emoji?: string;
  breadcrumbs?: BreadcrumbItem[];
  extra?: React.ReactNode;
}

const ROUTE_LABELS: Record<string, string> = {
  admin: 'Admin',
  inspector: 'Inspector',
  specialist: 'Specialist',
  engineer: 'Engineer',
  quality: 'Quality',
  users: 'Users',
  equipment: 'Equipment',
  checklists: 'Checklists',
  schedules: 'Schedules',
  assignments: 'Assignments',
  inspections: 'Inspections',
  'specialist-jobs': 'Specialist Jobs',
  'engineer-jobs': 'Engineer Jobs',
  'quality-reviews': 'Quality Reviews',
  approvals: 'Approvals',
  routines: 'Routines',
  defects: 'Defects',
  backlog: 'Backlog',
  reports: 'Reports',
  'daily-review': 'Daily Review',
  overdue: 'Overdue',
  performance: 'Performance',
  leaves: 'Leaves',
  roster: 'Roster',
  materials: 'Materials',
  'pm-templates': 'PM Templates',
  cycles: 'Cycles',
  'work-planning': 'Work Planning',
  'work-plan-settings': 'Work Plan Settings',
  'leave-settings': 'Leave Settings',
  'notification-rules': 'Notification Rules',
  'notification-analytics': 'Notification Analytics',
  profile: 'Profile',
  notifications: 'Notifications',
  leaderboard: 'Leaderboard',
  'my-work-plan': 'My Work Plan',
  'equipment-dashboard': 'Equipment Dashboard',
  'running-hours': 'Running Hours',
  jobs: 'Jobs',
  create: 'Create',
  'team-assignment': 'Team Assignment',
  'pause-approvals': 'Pause Approvals',
  reviews: 'Reviews',
  'bonus-requests': 'Bonus Requests',
};

export default function PageHeader({ title, emoji, breadcrumbs, extra }: PageHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const autoBreadcrumbs = () => {
    const segments = location.pathname.split('/').filter(Boolean);
    const items: { title: React.ReactNode; onClick?: () => void }[] = [
      {
        title: <HomeOutlined />,
        onClick: () => navigate('/'),
      },
    ];

    let path = '';
    for (const segment of segments) {
      path += `/${segment}`;
      const label = ROUTE_LABELS[segment] || segment;
      const currentPath = path;
      items.push({
        title: label,
        onClick: currentPath !== location.pathname ? () => navigate(currentPath) : undefined,
      });
    }
    return items;
  };

  const crumbs = breadcrumbs
    ? [
        { title: <HomeOutlined />, onClick: () => navigate('/') },
        ...breadcrumbs.map((b) => ({
          title: b.title,
          onClick: b.path ? () => navigate(b.path!) : undefined,
        })),
      ]
    : autoBreadcrumbs();

  return (
    <div style={{ marginBottom: 16 }}>
      <Breadcrumb
        items={crumbs.map((c) => ({
          title: c.onClick ? (
            <a onClick={(e) => { e.preventDefault(); c.onClick?.(); }}>{c.title}</a>
          ) : (
            c.title
          ),
        }))}
        style={{ marginBottom: 8 }}
      />
      <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
        <Title level={4} style={{ margin: 0 }}>
          {emoji && <span style={{ marginRight: 8 }}>{emoji}</span>}
          {title}
        </Title>
        {extra && <div>{extra}</div>}
      </Space>
    </div>
  );
}
