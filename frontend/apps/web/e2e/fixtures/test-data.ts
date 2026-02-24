export const USERS = {
  admin:       { username: 'ali.k.a',      password: '500628', role: 'admin' },
  engineer:    { username: 'hussein.a.a',  password: '500017', role: 'engineer' },
  inspector:   { username: 'mohamed.q.h',  password: '500834', role: 'inspector' },
  specialist:  { username: 'mayuid.a.s',   password: '500552', role: 'specialist' },
  maintenance: { username: 'mohamed.l.y',  password: '500017', role: 'specialist' },
} as const;

export const MOCK_USERS = {
  admin:     { id: 1, username: 'ali.k.a',      full_name: 'Ali Admin',        role: 'admin' },
  inspector: { id: 2, username: 'inspector1',   full_name: 'Test Inspector',   role: 'inspector' },
  engineer:  { id: 3, username: 'hussein',      full_name: 'Hussein Engineer', role: 'engineer' },
  specialist:{ id: 4, username: 'specialist1',  full_name: 'Test Specialist',  role: 'specialist' },
  qe:        { id: 5, username: 'qe1',          full_name: 'QE User',          role: 'quality_engineer' },
};

export const SHARED_ROUTES = [
  '/',
  '/dashboard',
  '/notifications',
  '/leaderboard',
  '/leaves',
  '/profile',
  '/my-work-plan',
  '/equipment-dashboard',
];

export const ADMIN_ONLY_ROUTES = [
  '/admin/users',
  '/admin/equipment',
  '/admin/checklists',
  '/admin/schedules',
  '/admin/assignments',
  '/admin/inspections',
  '/admin/reports',
  '/admin/approvals',
  '/admin/routines',
  '/admin/backlog',
];

export const ARABIC = {
  hello:     'مرحبا',
  note:      'ملاحظة للاختبار',
  equipment: 'معدات المصنع',
  mixed:     'Test Note - ملاحظة',
};
