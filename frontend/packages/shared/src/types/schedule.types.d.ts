export interface Schedule {
    id: number;
    equipment_id: number;
    equipment_name: string;
    day_of_week: number;
    frequency: string;
    is_active: boolean;
    next_due: string | null;
    last_completed: string | null;
}
//# sourceMappingURL=schedule.types.d.ts.map