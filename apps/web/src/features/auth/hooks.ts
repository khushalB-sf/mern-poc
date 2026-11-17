import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe, login, logout } from './api';
import type { Question, User } from '../../shared/api/types';

export const ME_KEY = ['me'] as const;

/** Single source of truth for "who is signed in". Nothing about the session is stored in the browser. */
export const useMe = () =>
  useQuery({
    queryKey: ME_KEY,
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: 5 * 60_000,
    retry: false,
  });

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      login(email, password),
    onSuccess: (user) => {
      qc.clear(); // never show a previous user's cached data
      qc.setQueryData(ME_KEY, user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      qc.clear();
      qc.setQueryData(ME_KEY, null);
    },
  });
}

/** Mirror the server rules. The API enforces them; these only decide whether to show a control. */
export const isAdmin = (user: User) => user.role === 'ADMIN';
export const canCreate = (user: User) => user.role === 'AUTHOR' || isAdmin(user);
export const canEdit = (user: User, q: Question) =>
  isAdmin(user) || (user.role === 'AUTHOR' && q.author.id === user.id);
/** Admins may (re)decide any question; reviewers only pending ones that are not their own. */
export const canReview = (user: User, q: Question) =>
  isAdmin(user) || (user.role === 'REVIEWER' && q.status === 'PENDING' && q.author.id !== user.id);
export const canDelete = (user: User) => isAdmin(user);
