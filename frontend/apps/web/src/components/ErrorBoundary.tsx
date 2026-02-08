import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Result, Button, Space } from 'antd';
import { ReloadOutlined, HomeOutlined, WifiOutlined } from '@ant-design/icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isOfflineError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isOfflineError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if this is a dynamic import / chunk loading error
    const isChunkError =
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Loading CSS chunk') ||
      error.name === 'ChunkLoadError';

    return {
      hasError: true,
      error,
      isOfflineError: isChunkError && !navigator.onLine,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, isOfflineError: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      // Check if it's an offline/chunk loading error
      const isChunkError =
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Loading chunk');

      if (isChunkError) {
        return (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Result
              icon={<WifiOutlined style={{ color: '#faad14' }} />}
              title={navigator.onLine ? 'Page failed to load' : 'You are offline'}
              subTitle={
                navigator.onLine
                  ? 'There was an issue loading this page. Please reload to try again.'
                  : 'This page needs to be loaded while online first. Please reconnect and reload.'
              }
              extra={
                <Space>
                  <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={this.handleReload}
                  >
                    Reload Page
                  </Button>
                  <Button icon={<HomeOutlined />} onClick={() => window.location.assign('/')}>
                    Go Home
                  </Button>
                </Space>
              }
            />
          </div>
        );
      }

      return (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Result
            status="error"
            title="Something went wrong"
            subTitle={this.state.error?.message || 'An unexpected error occurred'}
            extra={
              <Space>
                <Button type="primary" onClick={this.handleReset}>
                  Try Again
                </Button>
                <Button onClick={() => window.location.assign('/')}>
                  Go Home
                </Button>
              </Space>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}
