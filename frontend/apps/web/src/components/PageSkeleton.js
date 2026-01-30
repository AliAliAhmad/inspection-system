import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, Skeleton, Row, Col, Space } from 'antd';
export function TablePageSkeleton() {
    return (_jsxs("div", { children: [_jsx(Card, { style: { marginBottom: 16 }, children: _jsxs(Space, { style: { width: '100%', justifyContent: 'space-between' }, children: [_jsx(Skeleton.Input, { active: true, style: { width: 200 } }), _jsx(Skeleton.Button, { active: true })] }) }), _jsx(Card, { children: _jsx(Skeleton, { active: true, paragraph: { rows: 8 } }) })] }));
}
export function DetailPageSkeleton() {
    return (_jsxs("div", { children: [_jsx(Card, { style: { marginBottom: 16 }, children: _jsx(Skeleton, { active: true, paragraph: { rows: 1 } }) }), _jsx(Card, { style: { marginBottom: 16 }, children: _jsx(Skeleton, { active: true, paragraph: { rows: 4 } }) }), _jsx(Card, { children: _jsx(Skeleton, { active: true, paragraph: { rows: 6 } }) })] }));
}
export function DashboardSkeleton() {
    return (_jsxs("div", { children: [_jsx(Skeleton.Input, { active: true, style: { width: 300, marginBottom: 16 } }), _jsx(Row, { gutter: [16, 16], children: [1, 2, 3, 4].map((i) => (_jsx(Col, { xs: 24, sm: 12, lg: 6, children: _jsx(Card, { children: _jsx(Skeleton, { active: true, paragraph: { rows: 1 } }) }) }, i))) })] }));
}
//# sourceMappingURL=PageSkeleton.js.map