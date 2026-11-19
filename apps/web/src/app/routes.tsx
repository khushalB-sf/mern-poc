import type { RouteObject } from 'react-router';
import { AccountPage } from '../features/auth/AccountPage';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { AdminDepartmentsPage } from '../features/admin/AdminDepartmentsPage';
import { AdminAuditPage } from '../features/admin/AdminAuditPage';
import { AdminDeletedQuestionsPage } from '../features/admin/AdminDeletedQuestionsPage';
import { AdminTagsPage } from '../features/admin/AdminTagsPage';
import { AdminUsersPage } from '../features/admin/AdminUsersPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { RequireRole } from '../features/auth/RequireRole';
import { HowItWorksPage } from '../features/how-it-works/HowItWorksPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { QuestionDetailPage } from '../features/questions/QuestionDetailPage';
import { QuestionFormPage } from '../features/questions/QuestionFormPage';
import { QuestionListPage } from '../features/questions/QuestionListPage';
import { AppShell } from './AppShell';
import { NotFoundPage, RouteError } from './pages';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  // Public: the one-time link is the credential.
  { path: '/reset-password', element: <ResetPasswordPage />, errorElement: <RouteError /> },
  // Public: it explains the access rules and holds no data, so it needs no session.
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [{ path: 'how-it-works', element: <HowItWorksPage /> }],
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <QuestionListPage /> },
          { path: 'account', element: <AccountPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'change-password', element: <ChangePasswordPage /> },
          { path: 'questions/new', element: <QuestionFormPage mode="create" /> },
          { path: 'questions/:id', element: <QuestionDetailPage /> },
          { path: 'questions/:id/edit', element: <QuestionFormPage mode="edit" /> },
          {
            element: <RequireRole roles={['ADMIN']} />,
            children: [
              { path: 'admin/users', element: <AdminUsersPage /> },
              { path: 'admin/departments', element: <AdminDepartmentsPage /> },
              { path: 'admin/deleted-questions', element: <AdminDeletedQuestionsPage /> },
              { path: 'admin/tags', element: <AdminTagsPage /> },
              { path: 'admin/audit', element: <AdminAuditPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
