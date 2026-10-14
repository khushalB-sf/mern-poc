export type Role = 'USER' | 'AUTHOR' | 'REVIEWER';

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
  tags: { value: string; label: string }[];
}

export interface Client {
  id: string;
  name: string;
}

export type HistoryType = 'QUESTION_CREATED' | 'QUESTION_UPDATED' | 'DUPLICATE_OVERRIDDEN';

export interface HistoryItem {
  id: string;
  type: HistoryType;
  at: string;
  actor: { id: string; name: string };
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export interface DuplicateMatch {
  id: string;
  text: string;
  similarity: number;
}
