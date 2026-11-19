import type { RouteObject } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { RequireRole } from '../features/auth/RequireRole';
import { QuestionListPage } from '../features/questions/QuestionListPage';
import { AppShell } from './AppShell';
import { NotFoundPage, RouteError } from './pages';

// Everything but sign-in and the question list is loaded when first visited, so the first paint does not
// pay for the admin screens, the editor or the long How-it-works page.
const page = <T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) =>
  ({ lazy: async () => ({ Component: (await load())[name] }) }) satisfies RouteObject;

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  // Public: it explains the access rules and holds no data, so it needs no session.
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        path: 'how-it-works',
        ...page(() => import('../features/how-it-works/HowItWorksPage'), 'HowItWorksPage'),
      },
    ],
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <QuestionListPage /> },
          {
            path: 'notifications',
            ...page(
              () => import('../features/notifications/NotificationsPage'),
              'NotificationsPage',
            ),
          },
          {
            path: 'questions/new',
            lazy: async () => {
              const { QuestionFormPage } = await import('../features/questions/QuestionFormPage');
              return { element: <QuestionFormPage mode="create" /> };
            },
          },
          {
            path: 'questions/:id',
            ...page(() => import('../features/questions/QuestionDetailPage'), 'QuestionDetailPage'),
          },
          {
            path: 'questions/:id/edit',
            lazy: async () => {
              const { QuestionFormPage } = await import('../features/questions/QuestionFormPage');
              return { element: <QuestionFormPage mode="edit" /> };
            },
          },
          {
            element: <RequireRole roles={['ADMIN']} />,
            children: [
              {
                path: 'admin/users',
                ...page(() => import('../features/admin/AdminUsersPage'), 'AdminUsersPage'),
              },
              {
                path: 'admin/departments',
                ...page(
                  () => import('../features/admin/AdminDepartmentsPage'),
                  'AdminDepartmentsPage',
                ),
              },
              {
                path: 'admin/deleted-questions',
                ...page(
                  () => import('../features/admin/AdminDeletedQuestionsPage'),
                  'AdminDeletedQuestionsPage',
                ),
              },
              {
                path: 'admin/tags',
                ...page(() => import('../features/admin/AdminTagsPage'), 'AdminTagsPage'),
              },
              {
                path: 'admin/audit',
                ...page(() => import('../features/admin/AdminAuditPage'), 'AdminAuditPage'),
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
