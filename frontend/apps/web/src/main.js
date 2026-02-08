import { jsx as _jsx } from "react/jsx-runtime";
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './providers/AuthProvider';
import { LanguageProvider } from './providers/LanguageProvider';
import { OfflineProvider } from './providers/OfflineProvider';
import './index.css';
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30000,
        },
    },
});
ReactDOM.createRoot(document.getElementById('root')).render(_jsx(React.StrictMode, { children: _jsx(QueryClientProvider, { client: queryClient, children: _jsx(BrowserRouter, { children: _jsx(LanguageProvider, { children: _jsx(OfflineProvider, { children: _jsx(AuthProvider, { children: _jsx(App, {}) }) }) }) }) }) }));
//# sourceMappingURL=main.js.map