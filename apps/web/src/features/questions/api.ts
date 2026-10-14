import { apiFetch } from '../../shared/api/client';
import type {
  Client,
  HistoryItem,
  Question,
  QuestionPage,
  TagCategory,
} from '../../shared/api/types';
import { toApiQuery, type Filters } from './filters';

export const listQuestions = (f: Filters, signal?: AbortSignal) =>
  apiFetch<QuestionPage>(`/questions?${toApiQuery(f)}`, { signal });

export const getQuestion = (id: string, signal?: AbortSignal) =>
  apiFetch<{ question: Question }>(`/questions/${id}`, { signal }).then((r) => r.question);

export const getHistory = (id: string, signal?: AbortSignal) =>
  apiFetch<{ items: HistoryItem[] }>(`/questions/${id}/history`, { signal }).then((r) => r.items);

export const listTags = (signal?: AbortSignal) =>
  apiFetch<{ categories: TagCategory[] }>('/tags', { signal }).then((r) => r.categories);

export const listClients = (signal?: AbortSignal) =>
  apiFetch<{ items: Client[] }>('/clients', { signal }).then((r) => r.items);

export interface QuestionInput {
  text: string;
  answerNotes: string;
  tags: string[];
  clientId?: string | undefined;
  confirmNotDuplicate?: boolean;
}

export const createQuestion = (body: QuestionInput) =>
  apiFetch<{ question: Question }>('/questions', { method: 'POST', body }).then((r) => r.question);

export const updateQuestion = (
  id: string,
  body: Pick<QuestionInput, 'text' | 'answerNotes' | 'tags'>,
) =>
  apiFetch<{ question: Question }>(`/questions/${id}`, { method: 'PATCH', body }).then(
    (r) => r.question,
  );
