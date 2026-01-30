import React, { Component, ErrorInfo, ReactNode } from 'react';
interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}
interface State {
    hasError: boolean;
    error: Error | null;
}
export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props);
    static getDerivedStateFromError(error: Error): State;
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void;
    handleReset: () => void;
    render(): string | number | boolean | Iterable<React.ReactNode> | import("react/jsx-runtime").JSX.Element | null | undefined;
}
export {};
//# sourceMappingURL=ErrorBoundary.d.ts.map