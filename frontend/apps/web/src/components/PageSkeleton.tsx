import { Card, Skeleton, Row, Col, Space } from 'antd';

export function TablePageSkeleton() {
  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Skeleton.Input active style={{ width: 200 }} />
          <Skeleton.Button active />
        </Space>
      </Card>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Skeleton.Input active block style={{ height: 44 }} />
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton.Input key={i} active block style={{ height: 40, opacity: 1 - i * 0.08 }} />
          ))}
        </Space>
      </Card>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Skeleton active paragraph={{ rows: 1 }} />
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div>
      <Skeleton.Input active style={{ width: 300, marginBottom: 16 }} />
      <Row gutter={[16, 16]}>
        {[1, 2, 3, 4].map((i) => (
          <Col xs={24} sm={12} lg={6} key={i}>
            <Card>
              <Skeleton active paragraph={{ rows: 1 }} />
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Card><Skeleton active paragraph={{ rows: 6 }} /></Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card><Skeleton active paragraph={{ rows: 6 }} /></Card>
        </Col>
      </Row>
    </div>
  );
}

export function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Row gutter={[16, 16]}>
      {Array.from({ length: count }, (_, i) => (
        <Col key={i} xs={24} sm={12} lg={8}>
          <Card>
            <Skeleton active avatar paragraph={{ rows: 2 }} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

export function FormSkeleton() {
  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <Skeleton.Input active style={{ width: 120, height: 16, marginBottom: 8 }} />
            <Skeleton.Input active block style={{ height: 40 }} />
          </div>
        ))}
        <Skeleton.Button active style={{ width: 120 }} />
      </Space>
    </Card>
  );
}
