import { apiFetch } from '../../shared/api/client';

export interface NotificationItem {
  id: string;
  type: 'QUESTION_APPROVED' | 'QUESTION_REJECTED';
  questionId: string;
  at: string;
  readAt: string | null;
  /** Null once you can no longer see the question (deleted, or the department was taken away). */
  question: { id: string; text: string } | null;
}

export const listNotifications = (signal?: AbortSignal) =>
  apiFetch<{ items: NotificationItem[]; unreadCount: number }>('/notifications', { signal });

export const markAllRead = () =>
  apiFetch<void>('/notifications/read', { method: 'POST', body: { all: true } });
