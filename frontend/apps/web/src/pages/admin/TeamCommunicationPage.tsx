import React, { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Badge,
  Tabs,
  List,
  Avatar,
  Typography,
  message,
  Row,
  Col,
  Statistic,
  Tooltip,
  Empty,
} from 'antd';
import {
  MessageOutlined,
  PlusOutlined,
  TeamOutlined,
  SoundOutlined,
  AudioOutlined,
  PictureOutlined,
  EnvironmentOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamCommunicationApi } from '@inspection/shared';
import type { TeamChannel, TeamMessage } from '@inspection/shared';
import { useTranslation } from 'react-i18next';

const { TextArea } = Input;
const { Text, Title } = Typography;

const CHANNEL_TYPE_CONFIG: Record<string, { color: string; icon: string; label: string; labelAr: string }> = {
  general: { color: 'blue', icon: '💬', label: 'General', labelAr: 'عام' },
  shift: { color: 'orange', icon: '🔄', label: 'Shift', labelAr: 'وردية' },
  role: { color: 'purple', icon: '👥', label: 'Role', labelAr: 'دور' },
  job: { color: 'cyan', icon: '🔧', label: 'Job', labelAr: 'عمل' },
  emergency: { color: 'red', icon: '🚨', label: 'Emergency', labelAr: 'طوارئ' },
};

const MSG_TYPE_ICON: Record<string, React.ReactNode> = {
  text: <MessageOutlined />,
  voice: <AudioOutlined />,
  photo: <PictureOutlined />,
  location: <EnvironmentOutlined />,
  system: <SoundOutlined />,
};

export default function TeamCommunicationPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const queryClient = useQueryClient();
  const [selectedChannel, setSelectedChannel] = useState<TeamChannel | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [broadcastVisible, setBroadcastVisible] = useState(false);
  const [form] = Form.useForm();
  const [broadcastForm] = Form.useForm();

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['admin-channels'],
    queryFn: () => teamCommunicationApi.getChannels().then(r => r.data.data),
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['admin-messages', selectedChannel?.id],
    queryFn: () => selectedChannel
      ? teamCommunicationApi.getMessages(selectedChannel.id, { per_page: 100 }).then(r => r.data.data)
      : Promise.resolve([]),
    enabled: !!selectedChannel,
  });

  const createMutation = useMutation({
    mutationFn: (values: any) => teamCommunicationApi.createChannel(values),
    onSuccess: () => {
      message.success(isAr ? 'تم إنشاء القناة' : 'Channel created');
      setCreateModalVisible(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
    onError: () => {
      message.error(isAr ? 'فشل إنشاء القناة' : 'Failed to create channel');
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: (values: { content: string }) => teamCommunicationApi.broadcast(values),
    onSuccess: () => {
      message.success(isAr ? 'تم إرسال البث لجميع القنوات' : 'Broadcast sent to all channels');
      setBroadcastVisible(false);
      broadcastForm.resetFields();
    },
    onError: () => {
      message.error(isAr ? 'فشل إرسال البث' : 'Failed to send broadcast');
    },
  });

  const totalMembers = channels.reduce((acc: number, ch: TeamChannel) => acc + (ch.member_count || 0), 0);
  const totalUnread = channels.reduce((acc: number, ch: TeamChannel) => acc + (ch.unread_count || 0), 0);

  const channelColumns = [
    {
      title: isAr ? 'القناة' : 'Channel',
      key: 'name',
      render: (_: any, record: TeamChannel) => (
        <Space>
          <span style={{ fontSize: 20 }}>
            {CHANNEL_TYPE_CONFIG[record.channel_type]?.icon || '💬'}
          </span>
          <div>
            <Text strong>{record.name}</Text>
            {record.description && (
              <div><Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text></div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: isAr ? 'النوع' : 'Type',
      key: 'type',
      render: (_: any, record: TeamChannel) => {
        const cfg = CHANNEL_TYPE_CONFIG[record.channel_type];
        return <Tag color={cfg?.color}>{isAr ? cfg?.labelAr : cfg?.label || record.channel_type}</Tag>;
      },
    },
    {
      title: isAr ? 'الأعضاء' : 'Members',
      dataIndex: 'member_count',
      key: 'members',
      render: (count: number) => (
        <Space>
          <TeamOutlined />
          <span>{count}</span>
        </Space>
      ),
    },
    {
      title: isAr ? 'الفلاتر' : 'Filters',
      key: 'filters',
      render: (_: any, record: TeamChannel) => (
        <Space size={4} wrap>
          {record.shift && <Tag color="orange">{record.shift}</Tag>}
          {record.role_filter && <Tag color="purple">{record.role_filter}</Tag>}
        </Space>
      ),
    },
    {
      title: isAr ? 'آخر نشاط' : 'Last Activity',
      key: 'last',
      render: (_: any, record: TeamChannel) =>
        record.last_message ? (
          <Tooltip title={record.last_message.content}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(record.last_message.created_at).toLocaleString()}
            </Text>
          </Tooltip>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: isAr ? 'غير مقروء' : 'Unread',
      key: 'unread',
      render: (_: any, record: TeamChannel) => (
        <Badge count={record.unread_count || 0} />
      ),
    },
    {
      title: isAr ? 'إجراء' : 'Action',
      key: 'action',
      render: (_: any, record: TeamChannel) => (
        <Button
          type="link"
          icon={<MessageOutlined />}
          onClick={() => setSelectedChannel(record)}
        >
          {isAr ? 'عرض' : 'View'}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Stats Row */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title={isAr ? 'إجمالي القنوات' : 'Total Channels'}
              value={channels.length}
              prefix={<MessageOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={isAr ? 'إجمالي الأعضاء' : 'Total Members'}
              value={totalMembers}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={isAr ? 'رسائل غير مقروءة' : 'Unread Messages'}
              value={totalUnread}
              prefix={<AlertOutlined />}
              valueStyle={totalUnread > 0 ? { color: '#ff4d4f' } : undefined}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={isAr ? 'قنوات نشطة' : 'Active Channels'}
              value={channels.filter((c: TeamChannel) => c.is_active).length}
              prefix="🟢"
            />
          </Card>
        </Col>
      </Row>

      {/* Actions */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Title level={4} style={{ margin: 0 }}>
          {isAr ? '💬 تواصل الفريق' : '💬 Team Communication'}
        </Title>
        <Space>
          <Button
            type="primary"
            danger
            icon={<SoundOutlined />}
            onClick={() => setBroadcastVisible(true)}
          >
            {isAr ? 'بث عام' : 'Broadcast'}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
          >
            {isAr ? 'قناة جديدة' : 'New Channel'}
          </Button>
        </Space>
      </div>

      {/* Tabs: Channels + Messages */}
      <Tabs
        activeKey={selectedChannel ? 'messages' : 'channels'}
        onChange={(key) => { if (key === 'channels') setSelectedChannel(null); }}
        items={[
          {
            key: 'channels',
            label: <span>{isAr ? '📋 القنوات' : '📋 Channels'} ({channels.length})</span>,
            children: (
              <Card>
                <Table
                  dataSource={channels}
                  columns={channelColumns}
                  rowKey="id"
                  loading={isLoading}
                  pagination={{ pageSize: 10 }}
                />
              </Card>
            ),
          },
          {
            key: 'messages',
            label: selectedChannel ? (
              <span>💬 {selectedChannel.name}</span>
            ) : (
              <span>💬 {isAr ? 'الرسائل' : 'Messages'}</span>
            ),
            disabled: !selectedChannel,
            children: selectedChannel ? (
              <Card
                title={
                  <Space>
                    <span style={{ fontSize: 20 }}>
                      {CHANNEL_TYPE_CONFIG[selectedChannel.channel_type]?.icon}
                    </span>
                    <span>{selectedChannel.name}</span>
                    <Tag color={CHANNEL_TYPE_CONFIG[selectedChannel.channel_type]?.color}>
                      {selectedChannel.channel_type}
                    </Tag>
                  </Space>
                }
                extra={
                  <Button onClick={() => setSelectedChannel(null)}>
                    {isAr ? 'رجوع للقنوات' : 'Back to Channels'}
                  </Button>
                }
              >
                <List
                  dataSource={messages}
                  renderItem={(msg: TeamMessage) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          msg.message_type === 'system' ? (
                            <Avatar style={{ backgroundColor: '#ff4d4f' }}>📢</Avatar>
                          ) : (
                            <Avatar style={{ backgroundColor: '#1677ff' }}>
                              {(msg.sender_name || '?')[0].toUpperCase()}
                            </Avatar>
                          )
                        }
                        title={
                          <Space>
                            <Text strong>{msg.sender_name || (isAr ? 'النظام' : 'System')}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {msg.sender_role}
                            </Text>
                            {msg.is_priority && <Tag color="red">{isAr ? 'عاجل' : 'URGENT'}</Tag>}
                            <span>{MSG_TYPE_ICON[msg.message_type]}</span>
                          </Space>
                        }
                        description={
                          <div>
                            {msg.message_type === 'voice' ? (
                              <Space>
                                <AudioOutlined />
                                <Text>{isAr ? 'رسالة صوتية' : 'Voice message'} ({msg.duration_seconds}s)</Text>
                              </Space>
                            ) : msg.message_type === 'photo' ? (
                              <Space>
                                <PictureOutlined />
                                <Text>{isAr ? 'صورة' : 'Photo'}</Text>
                              </Space>
                            ) : (
                              <Text>{msg.content}</Text>
                            )}
                            <div>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {new Date(msg.created_at).toLocaleString()} · {msg.read_count} {isAr ? 'قراءة' : 'reads'}
                              </Text>
                            </div>
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                  locale={{ emptyText: <Empty description={isAr ? 'لا رسائل' : 'No messages'} /> }}
                />
              </Card>
            ) : null,
          },
        ]}
      />

      {/* Create Channel Modal */}
      <Modal
        title={isAr ? '➕ إنشاء قناة' : '➕ Create Channel'}
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onOk={() => form.validateFields().then(createMutation.mutate)}
        confirmLoading={createMutation.isPending}
        okText={isAr ? 'إنشاء' : 'Create'}
        cancelText={isAr ? 'إلغاء' : 'Cancel'}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={isAr ? 'اسم القناة' : 'Channel Name'}
            rules={[{ required: true, message: isAr ? 'مطلوب' : 'Required' }]}
          >
            <Input placeholder={isAr ? 'مثال: فريق الصيانة' : 'e.g. Morning Shift Team'} maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label={isAr ? 'الوصف' : 'Description'}>
            <TextArea rows={2} placeholder={isAr ? 'وصف القناة...' : "What's this channel for?"} maxLength={500} />
          </Form.Item>
          <Form.Item name="channel_type" label={isAr ? 'النوع' : 'Type'} initialValue="general">
            <Select>
              <Select.Option value="general">💬 {isAr ? 'عام' : 'General'}</Select.Option>
              <Select.Option value="shift">🔄 {isAr ? 'وردية' : 'Shift'}</Select.Option>
              <Select.Option value="role">👥 {isAr ? 'حسب الدور' : 'Role'}</Select.Option>
              <Select.Option value="job">🔧 {isAr ? 'محادثة عمل' : 'Job'}</Select.Option>
              <Select.Option value="emergency">🚨 {isAr ? 'طوارئ' : 'Emergency'}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="shift" label={isAr ? 'فلتر الوردية' : 'Shift Filter'}>
            <Select allowClear placeholder={isAr ? 'جميع الورديات' : 'All shifts'}>
              <Select.Option value="morning">🌅 {isAr ? 'صباحي' : 'Morning'}</Select.Option>
              <Select.Option value="afternoon">☀️ {isAr ? 'مسائي' : 'Afternoon'}</Select.Option>
              <Select.Option value="night">🌙 {isAr ? 'ليلي' : 'Night'}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="role_filter" label={isAr ? 'فلتر الدور' : 'Role Filter'}>
            <Select allowClear placeholder={isAr ? 'جميع الأدوار' : 'All roles'}>
              <Select.Option value="inspector">🔍 {isAr ? 'المفتشين' : 'Inspectors'}</Select.Option>
              <Select.Option value="specialist">🔧 {isAr ? 'الفنيين' : 'Specialists'}</Select.Option>
              <Select.Option value="engineer">👷 {isAr ? 'المهندسين' : 'Engineers'}</Select.Option>
              <Select.Option value="quality_engineer">✅ {isAr ? 'جودة' : 'Quality Engineers'}</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Broadcast Modal */}
      <Modal
        title={isAr ? '📢 بث طوارئ' : '📢 Emergency Broadcast'}
        open={broadcastVisible}
        onCancel={() => setBroadcastVisible(false)}
        onOk={() => broadcastForm.validateFields().then(broadcastMutation.mutate)}
        confirmLoading={broadcastMutation.isPending}
        okText={isAr ? 'إرسال البث' : 'Send Broadcast'}
        cancelText={isAr ? 'إلغاء' : 'Cancel'}
        okButtonProps={{ danger: true }}
      >
        <div style={{
          backgroundColor: '#fff2f0', borderRadius: 8, padding: 12, marginBottom: 16,
          border: '1px solid #ffa39e',
        }}>
          <Text type="danger">
            {isAr
              ? '⚠️ سيتم إرسال رسالة عاجلة لجميع القنوات النشطة. استخدم فقط للاتصالات العاجلة.'
              : '⚠️ This will send a priority message to ALL active channels. Use only for urgent communications.'}
          </Text>
        </div>
        <Form form={broadcastForm} layout="vertical">
          <Form.Item
            name="content"
            label={isAr ? 'الرسالة' : 'Message'}
            rules={[{ required: true, message: isAr ? 'مطلوب' : 'Required' }]}
          >
            <TextArea rows={4} placeholder={isAr ? 'اكتب رسالة البث...' : 'Type your broadcast message...'} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
