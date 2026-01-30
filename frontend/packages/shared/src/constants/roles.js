export const ROLES = {
    ADMIN: 'admin',
    INSPECTOR: 'inspector',
    SPECIALIST: 'specialist',
    ENGINEER: 'engineer',
    QUALITY_ENGINEER: 'quality_engineer',
};
export const ROLE_LABELS = {
    admin: 'Admin',
    inspector: 'Inspector',
    specialist: 'Specialist',
    engineer: 'Engineer',
    quality_engineer: 'Quality Engineer',
};
export const ROLE_LABELS_AR = {
    admin: '\u0645\u062F\u064A\u0631',
    inspector: '\u0645\u0641\u062A\u0634',
    specialist: '\u0623\u062E\u0635\u0627\u0626\u064A',
    engineer: '\u0645\u0647\u0646\u062F\u0633',
    quality_engineer: '\u0645\u0647\u0646\u062F\u0633 \u062C\u0648\u062F\u0629',
};
export function hasRole(user, ...roles) {
    return roles.includes(user.role) || (user.minor_role !== null && roles.includes(user.minor_role));
}
//# sourceMappingURL=roles.js.map