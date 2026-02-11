import { Card, Typography, Space, Tag, List, Button, Progress, Empty, Spin, Tooltip, Badge } from 'antd';
import {
  BookOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  StarOutlined,
  RightOutlined,
  TrophyOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@inspection/shared';

const { Text, Paragraph, Title } = Typography;

export interface Course {
  id: number;
  title: string;
  description: string;
  duration_hours: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  skills: string[];
  priority: number;
  status: 'not_started' | 'in_progress' | 'completed';
  progress_percent?: number;
  category: string;
  thumbnail_url?: string;
  points_reward: number;
  certification?: boolean;
}

export interface LearningPathData {
  user_id: number;
  recommended_courses: Course[];
  total_courses: number;
  completed_courses: number;
  in_progress_courses: number;
  total_learning_hours: number;
}

export interface LearningPathCardProps {
  userId?: number;
  compact?: boolean;
  onStartCourse?: (courseId: number) => void;
}

const performanceApi = {
  getLearningPath: (userId?: number) =>
    apiClient.get('/api/performance/learning-path', { params: { user_id: userId } }),
  startCourse: (courseId: number) =>
    apiClient.post(`/api/performance/courses/${courseId}/start`),
};

const DIFFICULTY_CONFIG = {
  beginner: { color: '#52c41a', label: 'Beginner', icon: <StarOutlined /> },
  intermediate: { color: '#faad14', label: 'Intermediate', icon: <ThunderboltOutlined /> },
  advanced: { color: '#f5222d', label: 'Advanced', icon: <TrophyOutlined /> },
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  technical: <ExperimentOutlined />,
  safety: <SafetyCertificateOutlined />,
  quality: <CheckCircleOutlined />,
  leadership: <TrophyOutlined />,
  default: <BookOutlined />,
};

export function LearningPathCard({
  userId,
  compact = false,
  onStartCourse,
}: LearningPathCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['performance', 'learning-path', userId],
    queryFn: () => performanceApi.getLearningPath(userId).then((r) => r.data),
  });

  const startCourseMutation = useMutation({
    mutationFn: (courseId: number) => performanceApi.startCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance', 'learning-path'] });
    },
  });

  const learningData: LearningPathData | null = data?.data || null;

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (!learningData || learningData.recommended_courses.length === 0) {
    return (
      <Card
        title={
          <Space>
            <BookOutlined style={{ color: '#1677ff' }} />
            {t('performance.learning_path', 'Learning Path')}
          </Space>
        }
      >
        <Empty
          description={t('performance.no_courses', 'No recommended courses at this time')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const handleStartCourse = (courseId: number) => {
    if (onStartCourse) {
      onStartCourse(courseId);
    } else {
      startCourseMutation.mutate(courseId);
    }
  };

  const inProgressCourses = learningData.recommended_courses.filter((c) => c.status === 'in_progress');
  const notStartedCourses = learningData.recommended_courses.filter((c) => c.status === 'not_started');

  if (compact) {
    const topCourses = [...inProgressCourses, ...notStartedCourses].slice(0, 3);

    return (
      <Card
        title={
          <Space>
            <BookOutlined style={{ color: '#1677ff' }} />
            {t('performance.recommended_learning', 'Recommended Learning')}
          </Space>
        }
        size="small"
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            {learningData.completed_courses}/{learningData.total_courses} {t('common.completed', 'completed')}
          </Text>
        }
      >
        <List
          size="small"
          dataSource={topCourses}
          renderItem={(course) => {
            const difficultyConfig = DIFFICULTY_CONFIG[course.difficulty];
            const isInProgress = course.status === 'in_progress';

            return (
              <List.Item
                style={{ padding: '8px 0', cursor: 'pointer' }}
                onClick={() => handleStartCourse(course.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                  <Badge
                    count={isInProgress ? `${course.progress_percent}%` : course.priority}
                    style={{
                      backgroundColor: isInProgress ? '#1677ff' : '#f5f5f5',
                      color: isInProgress ? '#fff' : '#8c8c8c',
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: `${difficultyConfig.color}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: difficultyConfig.color,
                      }}
                    >
                      {CATEGORY_ICONS[course.category] || CATEGORY_ICONS.default}
                    </div>
                  </Badge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong ellipsis style={{ display: 'block' }}>
                      {course.title}
                    </Text>
                    <Space size={4}>
                      <ClockCircleOutlined style={{ fontSize: 11, color: '#8c8c8c' }} />
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {course.duration_hours}h
                      </Text>
                      <Tag
                        color={difficultyConfig.color}
                        style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}
                      >
                        {difficultyConfig.label}
                      </Tag>
                    </Space>
                  </div>
                  <RightOutlined style={{ color: '#8c8c8c' }} />
                </div>
              </List.Item>
            );
          }}
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <BookOutlined style={{ color: '#1677ff' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('performance.learning_path', 'Recommended Learning Path')}
          </Title>
        </Space>
      }
      extra={
        <Space>
          <Text type="secondary">
            {learningData.completed_courses}/{learningData.total_courses} completed
          </Text>
          <Tag icon={<ClockCircleOutlined />} color="blue">
            {learningData.total_learning_hours}h total
          </Tag>
        </Space>
      }
    >
      {/* Progress Overview */}
      <div
        style={{
          padding: 16,
          backgroundColor: '#f6ffed',
          borderRadius: 12,
          marginBottom: 16,
          border: '1px solid #b7eb8f',
        }}
      >
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <Progress
            type="circle"
            percent={Math.round(
              (learningData.completed_courses / learningData.total_courses) * 100
            )}
            size={80}
            strokeColor="#52c41a"
            format={(percent) => (
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{percent}%</div>
                <div style={{ fontSize: 10, color: '#8c8c8c' }}>Complete</div>
              </div>
            )}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('performance.in_progress', 'In Progress')}
                </Text>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#1677ff' }}>
                  {learningData.in_progress_courses}
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('performance.completed', 'Completed')}
                </Text>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#52c41a' }}>
                  {learningData.completed_courses}
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('performance.remaining', 'Remaining')}
                </Text>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#8c8c8c' }}>
                  {learningData.total_courses -
                    learningData.completed_courses -
                    learningData.in_progress_courses}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* In Progress Courses */}
      {inProgressCourses.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Text strong style={{ display: 'block', marginBottom: 12 }}>
            <PlayCircleOutlined style={{ marginRight: 4, color: '#1677ff' }} />
            {t('performance.continue_learning', 'Continue Learning')}
          </Text>
          {inProgressCourses.map((course) => {
            const difficultyConfig = DIFFICULTY_CONFIG[course.difficulty];

            return (
              <Card
                key={course.id}
                size="small"
                style={{
                  marginBottom: 12,
                  borderColor: '#1677ff',
                  backgroundColor: '#e6f7ff',
                }}
                hoverable
                onClick={() => handleStartCourse(course.id)}
              >
                <div style={{ display: 'flex', gap: 16 }}>
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 8,
                      backgroundColor: `${difficultyConfig.color}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      color: difficultyConfig.color,
                    }}
                  >
                    {CATEGORY_ICONS[course.category] || CATEGORY_ICONS.default}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <Text strong style={{ fontSize: 15 }}>{course.title}</Text>
                        <div style={{ marginTop: 4 }}>
                          <Space size={8}>
                            <Tag color={difficultyConfig.color} style={{ fontSize: 10 }}>
                              {difficultyConfig.label}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              <ClockCircleOutlined /> {course.duration_hours}h
                            </Text>
                            {course.certification && (
                              <Tooltip title={t('performance.grants_certification', 'Grants certification')}>
                                <SafetyCertificateOutlined style={{ color: '#faad14' }} />
                              </Tooltip>
                            )}
                          </Space>
                        </div>
                      </div>
                      <Button type="primary" size="small" icon={<PlayCircleOutlined />}>
                        {t('performance.continue', 'Continue')}
                      </Button>
                    </div>
                    <Progress
                      percent={course.progress_percent}
                      size="small"
                      style={{ marginTop: 8 }}
                      strokeColor="#1677ff"
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Recommended Courses */}
      <div>
        <Text strong style={{ display: 'block', marginBottom: 12 }}>
          <StarOutlined style={{ marginRight: 4, color: '#faad14' }} />
          {t('performance.recommended_courses', 'Recommended Courses')}
        </Text>
        <List
          dataSource={notStartedCourses}
          renderItem={(course, index) => {
            const difficultyConfig = DIFFICULTY_CONFIG[course.difficulty];

            return (
              <List.Item
                style={{
                  padding: 16,
                  backgroundColor: index < 2 ? '#fffbe6' : '#fafafa',
                  borderRadius: 8,
                  marginBottom: 8,
                  border: index < 2 ? '1px solid #ffe58f' : '1px solid #f0f0f0',
                }}
              >
                <div style={{ display: 'flex', gap: 16, width: '100%' }}>
                  {/* Priority Badge */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: index < 2 ? '#faad14' : '#d9d9d9',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    {course.priority}
                  </div>

                  {/* Course Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <Text strong style={{ fontSize: 14 }}>{course.title}</Text>
                        <Paragraph
                          type="secondary"
                          ellipsis={{ rows: 2 }}
                          style={{ marginBottom: 8, fontSize: 12 }}
                        >
                          {course.description}
                        </Paragraph>
                      </div>
                    </div>

                    <Space size={8} wrap>
                      <Tag color={difficultyConfig.color} style={{ fontSize: 10 }}>
                        {difficultyConfig.label}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        <ClockCircleOutlined /> {course.duration_hours}h
                      </Text>
                      <Tag icon={<TrophyOutlined />} color="gold" style={{ fontSize: 10 }}>
                        +{course.points_reward} pts
                      </Tag>
                      {course.certification && (
                        <Tooltip title={t('performance.grants_certification', 'Grants certification')}>
                          <Tag icon={<SafetyCertificateOutlined />} color="green" style={{ fontSize: 10 }}>
                            {t('performance.certification', 'Certification')}
                          </Tag>
                        </Tooltip>
                      )}
                    </Space>

                    {/* Skills */}
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Skills: {course.skills.slice(0, 3).join(', ')}
                        {course.skills.length > 3 && ` +${course.skills.length - 3} more`}
                      </Text>
                    </div>
                  </div>

                  {/* Start Button */}
                  <Button
                    type={index < 2 ? 'primary' : 'default'}
                    icon={<PlayCircleOutlined />}
                    onClick={() => handleStartCourse(course.id)}
                    loading={startCourseMutation.isPending}
                  >
                    {t('performance.start', 'Start')}
                  </Button>
                </div>
              </List.Item>
            );
          }}
        />
      </div>
    </Card>
  );
}

export default LearningPathCard;
