import { jsx as _jsx } from "react/jsx-runtime";
import { Component } from 'react';
import { Result, Button } from 'antd';
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.handleReset = () => {
            this.setState({ hasError: false, error: null });
        };
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            if (this.props.fallback)
                return this.props.fallback;
            return (_jsx("div", { style: { padding: 48, textAlign: 'center' }, children: _jsx(Result, { status: "error", title: "Something went wrong", subTitle: this.state.error?.message || 'An unexpected error occurred', extra: [
                        _jsx(Button, { type: "primary", onClick: this.handleReset, children: "Try Again" }, "retry"),
                        _jsx(Button, { onClick: () => window.location.assign('/'), children: "Go Home" }, "home"),
                    ] }) }));
        }
        return this.props.children;
    }
}
//# sourceMappingURL=ErrorBoundary.js.map