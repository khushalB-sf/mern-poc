export type Role = 'USER' | 'AUTHOR' | 'REVIEWER' | 'ADMIN';
export type QuestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface TagRef {
  category: string;
  value: string;
}

export interface Question {
  id: string;
  text: string;
  answerNotes: string;
  client: { id: string; name: string } | null;
  tags: TagRef[];
  author: { id: string; name: string };
  status: QuestionStatus;
  /** Latest reviewer decision; null while PENDING. */
  review: { note: string | null; reviewer: { id: string; name: string }; at: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionPage {
  items: Question[];
  page: { limit: number; offset: number; total: number };
}

export interface TagCategory {
  slug: string;
  name: string;
  tags: { value: string; label: string; archived?: boolean; other?: boolean }[];
}

export interface Client {
  id: string;
  name: string;
  /** Values of the department's active technologies (only on the signed-in user's own list). */
  technologies?: string[];
}

export type HistoryType =
  | 'QUESTION_CREATED'
  | 'QUESTION_UPDATED'
  | 'DUPLICATE_OVERRIDDEN'
  | 'QUESTION_APPROVED'
  | 'QUESTION_REJECTED';

export interface HistoryItem {
  id: string;
  type: HistoryType;
  at: string;
  actor: { id: string; name: string };
  changes?: Record<string, { from: unknown; to: unknown }>;
  /** Reviewer's note on QUESTION_APPROVED / QUESTION_REJECTED. */
  note?: string | null;
}

/** A user as the admin screens see them. */
export interface AdminUser extends User {
  active: boolean;
  clients: Client[];
}

/** A department (the API calls it a "client") with the number of users granted it. */
export interface Department extends Client {
  description: string | null;
  userCount: number;
}

export interface DuplicateMatch {
  id: string;
  text: string;
  similarity: number;
}

export interface DepartmentImpact {
  questions: number;
  pending: number;
  users: number;
  /** Technologies only this department uses; they are archived with it. */
  technologies: number;
}

export interface DeletedQuestion {
  id: string;
  text: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  deletedAt: string;
  author: { id: string; name: string };
  department: Client | null;
  /** Restoring is blocked until the department is restored. */
  departmentDeleted: boolean;
}

/** A technology as the admin sees it under one department. */
export interface DepartmentTechnology {
  id: string;
  value: string;
  label: string;
  archived: boolean;
  questionCount: number;
  /** Another live department uses it too, so removing it here only unlinks it. */
  shared: boolean;
}

export interface DepartmentTechnologies {
  active: DepartmentTechnology[];
  archived: DepartmentTechnology[];
  /** Active technologies this department does not have yet. */
  available: { id: string; label: string }[];
}
