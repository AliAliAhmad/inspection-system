import { User } from './user.types';
export interface InspectionRating {
    id: number;
    inspection_id: number;
    rated_by_id: number;
    rated_by: User | null;
    rating: number;
    comment: string | null;
    asset_points: number;
    finding_points: number;
    admin_quality_bonus: number;
    rated_at: string;
}
//# sourceMappingURL=rating.types.d.ts.map