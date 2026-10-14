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

/** Mirrors the server rule. The API enforces it; this only decides whether to show the control. */
export const canCreate = (user: User) => user.role === 'AUTHOR' || user.role === 'REVIEWER';
export const canEdit = (user: User, q: Question) =>
  user.role === 'REVIEWER' || (user.role === 'AUTHOR' && q.author.id === user.id);
