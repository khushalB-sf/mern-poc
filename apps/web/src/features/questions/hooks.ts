import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createQuestion,
  getHistory,
  getQuestion,
  listClients,
  listQuestions,
  listTags,
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

export const useTags = () =>
  useQuery({
    queryKey: ['tags'],
    queryFn: ({ signal }) => listTags(signal),
    staleTime: Infinity,
    // Technology is what people filter by most, so it comes first; the API returns alphabetical order.
    select: (categories) =>
      [...categories].sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name)),
  });

export const useClients = () =>
  useQuery({
    queryKey: ['clients'],
    queryFn: ({ signal }) => listClients(signal),
    staleTime: 5 * 60_000,
  });

export function useCreateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QuestionInput) => createQuestion(input),
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
