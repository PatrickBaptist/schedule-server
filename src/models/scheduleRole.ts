export interface ScheduleRoleDefinition {
  id: string;
  name: string;
  active: boolean;
  order: number;
  legacyKey?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
