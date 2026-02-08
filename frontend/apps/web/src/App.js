import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Spin } from 'antd';
import { useAuth } from './providers/AuthProvider';
import AppRouter from './router/AppRouter';
import LoginPage from './pages/auth/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import AiAssistantChat from './components/AiAssistantChat';
import OfflineBanner from './components/OfflineBanner';
export default function App() {
    const { isAuthenticated, isLoading } = useAuth();
    if (isLoading) {
        return (_jsx("div", { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }, children: _jsx(Spin, { size: "large" }) }));
    }
    if (!isAuthenticated) {
        return _jsx(LoginPage, {});
    }
    return (_jsxs(ErrorBoundary, { children: [_jsx(OfflineBanner, {}), _jsx(AppRouter, {}), _jsx(AiAssistantChat, {})] }));
}
//# sourceMappingURL=App.js.map