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
  SearchOutlined,
  SendOutlined,
  AudioOutlined,
  PictureOutlined,
  EnvironmentOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamCommunicationApi } from '@inspection/shared';
import type { TeamChannel, TeamMessage } from '@inspection/shared';

const { TextArea } = Input;
const { Text, Title } = Typography;

const CHANNEL_TYPE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  general: { color: 'blue', icon: '💬', label: 'General' },
  shift: { color: 'orange', icon: '🔄', label: 'Shift' },
  role: { color: 'purple', icon: '👥', label: 'Role' },
  job: { color: 'cyan', icon: '🔧', label: 'Job' },
  emergency: { color: 'red', icon: '🚨', label: 'Emergency' },
};

const MSG_TYPE_ICON: Record<string, React.ReactNode> = {
  text: <MessageOutlined />,
  voice: <AudioOutlined />,
  photo: <PictureOutlined />,
  location: <EnvironmentOutlined />,
  system: <SoundOutlined />,
};

export default function TeamCommunicationPage() {
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
      message.success('Channel created');
      setCreateModalVisible(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: (values: { content: string }) => teamCommunicationApi.broadcast(values),
    onSuccess: () => {
      message.success('Broadcast sent to all channels');
      setBroadcastVisible(false);
      broadcastForm.resetFields();
    },
  });

  const totalMessages = channels.reduce((acc: number, ch: TeamChannel) => acc + (ch.member_count || 0), 0);
  const totalUnread = channels.reduce((acc: number, ch: TeamChannel) => acc + (ch.unread_count || 0), 0);

  const channelColumns = [
    {
      title: 'Channel',
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
      title: 'Type',
      key: 'type',
      render: (_: any, record: TeamChannel) => {
        const cfg = CHANNEL_TYPE_CONFIG[record.channel_type];
        return <Tag color={cfg?.color}>{cfg?.label || record.channel_type}</Tag>;
      },
    },
    {
      title: 'Members',
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
      title: 'Filters',
      key: 'filters',
      render: (_: any, record: TeamChannel) => (
        <Space size={4} wrap>
          {record.shift && <Tag color="orange">{record.shift}</Tag>}
          {record.role_filter && <Tag color="purple">{record.role_filter}</Tag>}
        </Space>
      ),
    },
    {
      title: 'Last Activity',
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
      title: 'Unread',
      key: 'unread',
      render: (_: any, record: TeamChannel) => (
        <Badge count={record.unread_count || 0} />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: TeamChannel) => (
        <Button
          type="link"
          icon={<MessageOutlined />}
          onClick={() => setSelectedChannel(record)}
        >
          View
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
              title="Total Channels"
              value={channels.length}
              prefix={<MessageOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Members"
              value={totalMessages}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Unread Messages"
              value={totalUnread}
              prefix={<AlertOutlined />}
              valueStyle={totalUnread > 0 ? { color: '#ff4d4f' } : undefined}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Active Channels"
              value={channels.filter((c: TeamChannel) => c.is_active).length}
              prefix="🟢"
            />
          </Card>
        </Col>
      </Row>

      {/* Actions */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Title level={4} style={{ margin: 0 }}>💬 Team Communication</Title>
        <Space>
          <Button
            type="primary"
            danger
            icon={<SoundOutlined />}
            onClick={() => setBroadcastVisible(true)}
          >
            Broadcast
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
          >
            New Channel
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
            label: <span>📋 Channels ({channels.length})</span>,
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
              <span>💬 Messages</span>
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
                    Back to Channels
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
                            <Text strong>{msg.sender_name || 'System'}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {msg.sender_role}
                            </Text>
                            {msg.is_priority && <Tag color="red">URGENT</Tag>}
                            <span>{MSG_TYPE_ICON[msg.message_type]}</span>
                          </Space>
                        }
                        description={
                          <div>
                            {msg.message_type === 'voice' ? (
                              <Space>
                                <AudioOutlined />
                                <Text>Voice message ({msg.duration_seconds}s)</Text>
                              </Space>
                            ) : msg.message_type === 'photo' ? (
                              <Space>
                                <PictureOutlined />
                                <Text>Photo</Text>
                              </Space>
                            ) : (
                              <Text>{msg.content}</Text>
                            )}
                            <div>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {new Date(msg.created_at).toLocaleString()} · {msg.read_count} reads
                              </Text>
                            </div>
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                  locale={{ emptyText: <Empty description="No messages" /> }}
                />
              </Card>
            ) : null,
          },
        ]}
      />

      {/* Create Channel Modal */}
      <Modal
        title="➕ Create Channel"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onOk={() => form.validateFields().then(createMutation.mutate)}
        confirmLoading={createMutation.isPending}
        okText="Create"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Channel Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Morning Shift Team" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <TextArea rows={2} placeholder="What's this channel for?" />
          </Form.Item>
          <Form.Item name="channel_type" label="Type" initialValue="general">
            <Select>
              <Select.Option value="general">💬 General</Select.Option>
              <Select.Option value="shift">🔄 Shift</Select.Option>
              <Select.Option value="role">👥 Role</Select.Option>
              <Select.Option value="job">🔧 Job</Select.Option>
              <Select.Option value="emergency">🚨 Emergency</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="shift" label="Shift Filter">
            <Select allowClear placeholder="All shifts">
              <Select.Option value="morning">🌅 Morning</Select.Option>
              <Select.Option value="afternoon">☀️ Afternoon</Select.Option>
              <Select.Option value="night">🌙 Night</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="role_filter" label="Role Filter">
            <Select allowClear placeholder="All roles">
              <Select.Option value="inspector">🔍 Inspectors</Select.Option>
              <Select.Option value="specialist">🔧 Specialists</Select.Option>
              <Select.Option value="engineer">👷 Engineers</Select.Option>
              <Select.Option value="quality_engineer">✅ Quality Engineers</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Broadcast Modal */}
      <Modal
        title="📢 Emergency Broadcast"
        open={broadcastVisible}
        onCancel={() => setBroadcastVisible(false)}
        onOk={() => broadcastForm.validateFields().then(broadcastMutation.mutate)}
        confirmLoading={broadcastMutation.isPending}
        okText="Send Broadcast"
        okButtonProps={{ danger: true }}
      >
        <div style={{
          backgroundColor: '#fff2f0', borderRadius: 8, padding: 12, marginBottom: 16,
          border: '1px solid #ffa39e',
        }}>
          <Text type="danger">
            ⚠️ This will send a priority message to ALL active channels.
            Use only for urgent communications.
          </Text>
        </div>
        <Form form={broadcastForm} layout="vertical">
          <Form.Item name="content" label="Message" rules={[{ required: true }]}>
            <TextArea rows={4} placeholder="Type your broadcast message..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
