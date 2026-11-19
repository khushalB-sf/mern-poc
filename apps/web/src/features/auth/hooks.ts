import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changePassword,
  fetchMe,
  login,
  logout,
  mfaDisable,
  mfaEnable,
  mfaSetup,
  mfaVerify,
  resetPassword,
} from './api';
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
    onSuccess: (result) => {
      // With two-factor on there is no session yet: the page asks for a code and signs in then.
      if (!('user' in result)) return;
      qc.clear(); // never show a previous user's cached data
      qc.setQueryData(ME_KEY, result.user);
    },
  });
}

export function useMfaVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mfaVerify,
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(ME_KEY, user);
    },
  });
}

const refreshMe = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ME_KEY });

export const useMfaSetup = () => useMutation({ mutationFn: mfaSetup });
export function useMfaEnable() {
  // Not refreshed here: the recovery codes are on screen, and the account page refreshes when they are dismissed.
  return useMutation({ mutationFn: mfaEnable });
}
export function useMfaDisable() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: mfaDisable, onSuccess: () => refreshMe(qc) });
}
export const refreshAccount = refreshMe;

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
/** An admin: anything. An author: their own question until it is approved. */
export const canDelete = (user: User, q: Question) =>
  isAdmin(user) || (q.author.id === user.id && q.status !== 'APPROVED');

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      // The forced-change gate lifts straight away; the server confirms on the next /auth/me.
      qc.setQueryData<User | null>(ME_KEY, (u) => (u ? { ...u, mustChangePassword: false } : u));
      void qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

export const useResetPassword = () => useMutation({ mutationFn: resetPassword });
