import { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  List,
  Empty,
  Badge,
  Divider,
  Statistic,
} from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  ToolOutlined,
  ExperimentOutlined,
  EyeOutlined,
  FilePdfOutlined,
  StarFilled,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workPlansApi, type MyWorkPlanDay, type WorkPlanJob } from '@inspection/shared';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

const { Title, Text } = Typography;

const JOB_TYPE_ICONS: Record<string, React.ReactNode> = {
  pm: <ToolOutlined />,
  defect: <ExperimentOutlined />,
  inspection: <EyeOutlined />,
};

const JOB_TYPE_COLORS: Record<string, string> = {
  pm: 'blue',
  defect: 'red',
  inspection: 'green',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'default',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
};

export default function MyWorkPlanPage() {
  const { t } = useTranslation();
  const [weekOffset, setWeekOffset] = useState(0);

  // Calculate week start (Monday)
  const currentWeekStart = dayjs().startOf('isoWeek').add(weekOffset, 'week');
  const weekStartStr = currentWeekStart.format('YYYY-MM-DD');

  // Fetch my plan
  const { data: myPlanData, isLoading } = useQuery({
    queryKey: ['my-work-plan', weekStartStr],
    queryFn: () => workPlansApi.getMyPlan(weekStartStr).then((r) => r.data),
  });

  // Generate week days
  const weekDays = Array.from({ length: 7 }, (_, i) => currentWeekStart.add(i, 'day'));

  // Calculate total hours
  const totalHours = myPlanData?.my_jobs?.reduce(
    (acc, day) => acc + day.jobs.reduce((a, j) => a + (j.estimated_hours || 0), 0),
    0
  ) || 0;

  const renderJobCard = (job: WorkPlanJob & { is_lead: boolean; day_date: string; day_name: string }) => (
    <Card
      key={job.id}
      size="small"
      style={{ marginBottom: 8 }}
      title={
        <Space>
          <Tag color={JOB_TYPE_COLORS[job.job_type]}>
            {JOB_TYPE_ICONS[job.job_type]} {job.job_type.toUpperCase()}
          </Tag>
          {job.is_lead && (
            <Tag color="gold" icon={<StarFilled />}>
              Team Lead
            </Tag>
          )}
          <Tag color={PRIORITY_COLORS[job.priority]}>{job.priority}</Tag>
        </Space>
      }
      extra={
        <Tag icon={<ClockCircleOutlined />}>{job.estimated_hours}h</Tag>
      }
    >
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        {job.equipment && (
          <div>
            <Text strong>Equipment: </Text>
            <Text>{job.equipment.serial_number} - {job.equipment.name}</Text>
          </div>
        )}

        {job.defect && (
          <div>
            <Text strong>Defect: </Text>
            <Text>{job.defect.description}</Text>
          </div>
        )}

        {job.berth && (
          <div>
            <Text type="secondary">Berth: {job.berth.toUpperCase()}</Text>
          </div>
        )}

        {job.notes && (
          <div>
            <Text type="secondary">Notes: {job.notes}</Text>
          </div>
        )}

        {/* Team members */}
        {job.assignments.length > 1 && (
          <div>
            <Text type="secondary">Team: </Text>
            {job.assignments.map((a) => (
              <Tag key={a.id}>
                {a.is_lead && '* '}
                {a.user?.full_name}
              </Tag>
            ))}
          </div>
        )}

        {/* Materials */}
        {job.materials.length > 0 && (
          <div>
            <Text type="secondary">Materials: </Text>
            <Space wrap size={4}>
              {job.materials.map((m) => (
                <Tag key={m.id}>
                  {m.material?.code} x{m.quantity}
                </Tag>
              ))}
            </Space>
          </div>
        )}
      </Space>
    </Card>
  );

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <CalendarOutlined /> My Work Plan
            </Title>
          </Col>
          {myPlanData?.work_plan?.pdf_url && (
            <Col>
              <Button icon={<FilePdfOutlined />} href={myPlanData.work_plan.pdf_url} target="_blank">
                View PDF
              </Button>
            </Col>
          )}
        </Row>

        {/* Week Navigation */}
        <Card style={{ marginBottom: 24 }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Button icon={<LeftOutlined />} onClick={() => setWeekOffset((o) => o - 1)}>
                Previous Week
              </Button>
            </Col>
            <Col style={{ textAlign: 'center' }}>
              <Title level={4} style={{ margin: 0 }}>
                {currentWeekStart.format('MMMM D')} - {currentWeekStart.add(6, 'day').format('MMMM D, YYYY')}
              </Title>
              {weekOffset !== 0 && (
                <Button type="link" onClick={() => setWeekOffset(0)}>
                  Go to current week
                </Button>
              )}
            </Col>
            <Col>
              <Button onClick={() => setWeekOffset((o) => o + 1)}>
                Next Week <RightOutlined />
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Summary */}
        {myPlanData?.work_plan && (
          <Row gutter={24} style={{ marginBottom: 24 }}>
            <Col span={8}>
              <Card>
                <Statistic title="Total Jobs" value={myPlanData.total_jobs} />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic title="Total Hours" value={totalHours} suffix="h" />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic title="Days with Jobs" value={myPlanData.my_jobs.length} suffix="/ 7" />
              </Card>
            </Col>
          </Row>
        )}

        {/* Week Calendar View */}
        <Card style={{ marginBottom: 24 }}>
          <Row gutter={8}>
            {weekDays.map((day, idx) => {
              const dayStr = day.format('YYYY-MM-DD');
              const dayData = myPlanData?.my_jobs?.find((d) => d.date === dayStr);
              const jobCount = dayData?.jobs.length || 0;
              const isToday = day.isSame(dayjs(), 'day');

              return (
                <Col span={24 / 7} key={idx}>
                  <Card
                    size="small"
                    style={{
                      textAlign: 'center',
                      background: isToday ? '#e6f7ff' : undefined,
                      borderColor: isToday ? '#1890ff' : undefined,
                    }}
                  >
                    <Text strong>{day.format('ddd')}</Text>
                    <br />
                    <Text>{day.format('MMM D')}</Text>
                    <br />
                    <Badge count={jobCount} showZero color={jobCount > 0 ? 'blue' : 'default'} />
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Card>

        {/* Jobs by Day */}
        {!myPlanData?.work_plan ? (
          <Empty description="No work plan published for this week" />
        ) : myPlanData.my_jobs.length === 0 ? (
          <Empty description="No jobs assigned to you for this week" />
        ) : (
          myPlanData.my_jobs.map((dayData: MyWorkPlanDay) => (
            <Card
              key={dayData.date}
              title={
                <Space>
                  <CalendarOutlined />
                  {dayData.day_name}, {dayjs(dayData.date).format('MMMM D')}
                  <Badge count={dayData.jobs.length} style={{ marginLeft: 8 }} />
                </Space>
              }
              style={{ marginBottom: 16 }}
            >
              {dayData.jobs.map(renderJobCard)}
            </Card>
          ))
        )}
      </Card>
    </div>
  );
}
