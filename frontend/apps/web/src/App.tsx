import { Spin } from 'antd';
import { useAuth } from './providers/AuthProvider';
import AppRouter from './router/AppRouter';
import LoginPage from './pages/auth/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import AiAssistantChat from './components/AiAssistantChat';
import OfflineBanner from './components/OfflineBanner';
import CommandPalette from './components/CommandPalette';

export default function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <ErrorBoundary>
      <OfflineBanner />
      <AppRouter />
      <AiAssistantChat />
      <CommandPalette />
    </ErrorBoundary>
  );
}
