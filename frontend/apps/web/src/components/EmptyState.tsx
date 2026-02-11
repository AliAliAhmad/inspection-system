import { Empty, Button, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface EmptyStateProps {
  icon?: string;
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon = '\ud83d\udce5',
  title = 'No data yet',
  description = 'There are no items to display at the moment.',
  actionText,
  onAction,
}: EmptyStateProps) {
  return (
    <Empty
      image={
        <div style={{ fontSize: 64, lineHeight: 1 }}>{icon}</div>
      }
      description={
        <div>
          <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>
            {title}
          </Text>
          <Text type="secondary">{description}</Text>
        </div>
      }
    >
      {actionText && onAction && (
        <Button type="primary" icon={<PlusOutlined />} onClick={onAction}>
          {actionText}
        </Button>
      )}
    </Empty>
  );
}
