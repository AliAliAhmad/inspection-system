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
        <Skeleton active paragraph={{ rows: 8 }} />
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
    </div>
  );
}
