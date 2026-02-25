import { Spin } from 'antd';
import { lazy, Suspense } from 'react';
import { useAuth } from './providers/AuthProvider';
import AppRouter from './router/AppRouter';
import LoginPage from './pages/auth/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';

const AiAssistantChat = lazy(() => import('./components/AiAssistantChat'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));

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
      <Suspense fallback={null}>
        <AiAssistantChat />
        <CommandPalette />
      </Suspense>
    </ErrorBoundary>
  );
}
