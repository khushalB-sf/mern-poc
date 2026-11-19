import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  createQuestion,
  deleteQuestion,
  getHistory,
  getQuestion,
  listClients,
  listQuestions,
  listTags,
  reviewQuestion,
  updateQuestion,
  type QuestionInput,
} from './api';
import type { Filters } from './filters';

export const useQuestionSearch = (filters: Filters) =>
  useQuery({
    queryKey: ['questions', 'list', filters],
    queryFn: ({ signal }) => listQuestions(filters, signal),
    staleTime: 30_000,
    // Keep showing the previous results (dimmed) while the next page or filter loads: no flashing.
    placeholderData: keepPreviousData,
  });

export const useQuestion = (id: string) =>
  useQuery({
    queryKey: ['questions', 'detail', id],
    queryFn: ({ signal }) => getQuestion(id, signal),
    enabled: id !== '', // the create form passes '' and must not fire a request
    retry: false,
  });

export const useHistory = (id: string) =>
  useQuery({
    queryKey: ['questions', 'history', id],
    queryFn: ({ signal }) => getHistory(id, signal),
    retry: false,
  });

// The taxonomy and a user's clients rarely change within a session.
const CATEGORY_ORDER = ['technology', 'seniority', 'type'];
const rank = (slug: string) => {
  const i = CATEGORY_ORDER.indexOf(slug);
  return i === -1 ? CATEGORY_ORDER.length : i;
};

// `forFilter` narrows Technology to the caller's departments (the list page's filter bar only).
/** After the API says the taxonomy changed under us, fetch the current tags and departments. */
export const refreshTaxonomy = (qc: QueryClient) =>
  Promise.all(['tags', 'clients'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

export const useTags = (forFilter = false) =>
  useQuery({
    queryKey: forFilter ? ['tags', 'filter'] : ['tags'],
    queryFn: ({ signal }) => listTags(signal, forFilter),
    // An admin can archive or move technologies at any time, so the list is re-checked when you come
    // back to the tab after a minute (not never, as it once was).
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // Technology is what people filter by most, so it comes first; the API returns alphabetical order.
    select: (categories) =>
      [...categories].sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name)),
  });

export const useClients = () =>
  useQuery({
    queryKey: ['clients'],
    queryFn: ({ signal }) => listClients(signal),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

export function useCreateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QuestionInput) => createQuestion(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions'] }),
  });
}

export function useDeleteQuestion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deleteQuestion(id),
    // The list and counts change; the detail query is dropped so nothing refetches a question that is gone.
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['questions', 'detail', id] });
      qc.removeQueries({ queryKey: ['questions', 'history', id] });
      return qc.invalidateQueries({ queryKey: ['questions'] });
    },
  });
}

export function useReviewQuestion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { decision: 'APPROVED' | 'REJECTED'; note: string }) =>
      reviewQuestion(id, input),
    // Detail, history and every list (the reviewer's queue changes) are now stale.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions'] }),
  });
}

export function useUpdateQuestion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<QuestionInput, 'text' | 'answerNotes' | 'tags'>) =>
      updateQuestion(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions'] }),
  });
}
