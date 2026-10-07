/* Lightweight development context representing the acting user in the request */
export interface RequestActor {
  orgId: string;
  userId: string;
  role?: string;
}
