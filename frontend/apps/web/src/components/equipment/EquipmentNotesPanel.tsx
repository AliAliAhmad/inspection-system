import React, { useState } from 'react';
import {
  Card,
  List,
  Button,
  Input,
  Tag,
  Space,
  Modal,
  Form,
  Select,
  Switch,
  Tooltip,
  Typography,
  Spin,
  Empty,
  message,
  Popconfirm,
} from 'antd';
import {
  PushpinOutlined,
  PushpinFilled,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  SafetyOutlined,
  ToolOutlined,
  WarningOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { equipmentApi } from '@inspection/shared';
import type { EquipmentNote, CreateNotePayload, NoteType } from '@inspection/shared';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface EquipmentNotesPanelProps {
  equipmentId: number;
  currentUserId?: number;
  isAdmin?: boolean;
}

const noteTypeConfig: Record<NoteType, { color: string; icon: React.ReactNode; label: string }> = {
  general: { color: 'default', icon: <InfoCircleOutlined />, label: 'General' },
  maintenance: { color: 'blue', icon: <ToolOutlined />, label: 'Maintenance' },
  safety: { color: 'red', icon: <SafetyOutlined />, label: 'Safety' },
  technical: { color: 'purple', icon: <InfoCircleOutlined />, label: 'Technical' },
  warning: { color: 'orange', icon: <WarningOutlined />, label: 'Warning' },
};

export const EquipmentNotesPanel: React.FC<EquipmentNotesPanelProps> = ({
  equipmentId,
  currentUserId,
  isAdmin = false,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<EquipmentNote | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: notes, isLoading } = useQuery({
    queryKey: ['equipment-notes', equipmentId],
    queryFn: async () => {
      const response = await equipmentApi.getNotes(equipmentId);
      return response.data?.data as EquipmentNote[];
    },
  });

  const addMutation = useMutation({
    mutationFn: (payload: CreateNotePayload) => equipmentApi.addNote(equipmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-notes', equipmentId] });
      message.success('Note added');
      setIsModalOpen(false);
      form.resetFields();
    },
    onError: () => message.error('Failed to add note'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ noteId, payload }: { noteId: number; payload: Partial<CreateNotePayload> }) =>
      equipmentApi.updateNote(equipmentId, noteId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-notes', equipmentId] });
      message.success('Note updated');
      setIsModalOpen(false);
      setEditingNote(null);
      form.resetFields();
    },
    onError: () => message.error('Failed to update note'),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: number) => equipmentApi.deleteNote(equipmentId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-notes', equipmentId] });
      message.success('Note deleted');
    },
    onError: () => message.error('Failed to delete note'),
  });

  const handleSubmit = async (values: any) => {
    const payload: CreateNotePayload = {
      content: values.content,
      note_type: values.note_type,
      is_pinned: values.is_pinned || false,
    };

    if (editingNote) {
      updateMutation.mutate({ noteId: editingNote.id, payload });
    } else {
      addMutation.mutate(payload);
    }
  };

  const handleEdit = (note: EquipmentNote) => {
    setEditingNote(note);
    form.setFieldsValue({
      content: note.content,
      note_type: note.note_type,
      is_pinned: note.is_pinned,
    });
    setIsModalOpen(true);
  };

  const handleTogglePin = (note: EquipmentNote) => {
    updateMutation.mutate({
      noteId: note.id,
      payload: { is_pinned: !note.is_pinned },
    });
  };

  const canEdit = (note: EquipmentNote) => isAdmin || note.user_id === currentUserId;

  const pinnedNotes = notes?.filter(n => n.is_pinned) || [];
  const regularNotes = notes?.filter(n => !n.is_pinned) || [];

  return (
    <>
      <Card
        title="Notes"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingNote(null);
              form.resetFields();
              setIsModalOpen(true);
            }}
            size="small"
          >
            Add Note
          </Button>
        }
        style={{ height: '100%' }}
      >
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : !notes?.length ? (
          <Empty description="No notes yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {/* Pinned Notes */}
            {pinnedNotes.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <PushpinFilled style={{ color: '#faad14' }} /> Pinned
                </Text>
                <List
                  size="small"
                  dataSource={pinnedNotes}
                  renderItem={(note) => (
                    <NoteItem
                      note={note}
                      canEdit={canEdit(note)}
                      onEdit={() => handleEdit(note)}
                      onDelete={() => deleteMutation.mutate(note.id)}
                      onTogglePin={() => handleTogglePin(note)}
                    />
                  )}
                />
              </div>
            )}

            {/* Regular Notes */}
            {regularNotes.length > 0 && (
              <List
                size="small"
                dataSource={regularNotes}
                renderItem={(note) => (
                  <NoteItem
                    note={note}
                    canEdit={canEdit(note)}
                    onEdit={() => handleEdit(note)}
                    onDelete={() => deleteMutation.mutate(note.id)}
                    onTogglePin={() => handleTogglePin(note)}
                  />
                )}
              />
            )}
          </div>
        )}
      </Card>

      <Modal
        title={editingNote ? 'Edit Note' : 'Add Note'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingNote(null);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="content"
            label="Content"
            rules={[{ required: true, message: 'Please enter note content' }]}
          >
            <TextArea rows={4} placeholder="Enter note content..." />
          </Form.Item>

          <Form.Item name="note_type" label="Type" initialValue="general">
            <Select>
              {Object.entries(noteTypeConfig).map(([key, config]) => (
                <Select.Option key={key} value={key}>
                  <Space>
                    {config.icon}
                    {config.label}
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="is_pinned" valuePropName="checked" initialValue={false}>
            <Switch checkedChildren="Pinned" unCheckedChildren="Not Pinned" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={addMutation.isPending || updateMutation.isPending}>
                {editingNote ? 'Update' : 'Add'} Note
              </Button>
              <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

interface NoteItemProps {
  note: EquipmentNote;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

const NoteItem: React.FC<NoteItemProps> = ({ note, canEdit, onEdit, onDelete, onTogglePin }) => {
  const config = noteTypeConfig[note.note_type as NoteType] || noteTypeConfig.general;

  return (
    <List.Item
      style={{
        padding: '12px 8px',
        backgroundColor: note.is_pinned ? '#fffbe6' : undefined,
        marginBottom: 8,
        borderRadius: 8,
        border: '1px solid #f0f0f0',
      }}
    >
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <Space>
            <Tag color={config.color} icon={config.icon}>
              {config.label}
            </Tag>
            {note.is_pinned && (
              <Tag color="gold" icon={<PushpinFilled />}>
                Pinned
              </Tag>
            )}
          </Space>
          {canEdit && (
            <Space size="small">
              <Tooltip title={note.is_pinned ? 'Unpin' : 'Pin'}>
                <Button
                  type="text"
                  size="small"
                  icon={note.is_pinned ? <PushpinFilled style={{ color: '#faad14' }} /> : <PushpinOutlined />}
                  onClick={onTogglePin}
                />
              </Tooltip>
              <Tooltip title="Edit">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} />
              </Tooltip>
              <Popconfirm title="Delete this note?" onConfirm={onDelete} okText="Yes" cancelText="No">
                <Tooltip title="Delete">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </Space>
          )}
        </div>
        <Paragraph style={{ marginBottom: 8 }}>{note.content}</Paragraph>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {note.user?.full_name || 'Unknown'}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {dayjs(note.created_at).fromNow()}
          </Text>
        </div>
      </div>
    </List.Item>
  );
};

export default EquipmentNotesPanel;
