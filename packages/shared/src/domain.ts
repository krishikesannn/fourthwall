export type AppRole = 'admin' | 'studio_member' | 'client';

export type InquiryStatus = 'new' | 'contacted' | 'qualified' | 'closed';

export type DeliverableStatus = 'draft' | 'in_review' | 'approved';

export interface ProjectAccess {
  projectId: string;
  userId: string;
  role: AppRole;
}
