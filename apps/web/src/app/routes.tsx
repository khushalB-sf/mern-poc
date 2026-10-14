import type { RouteObject } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { QuestionDetailPage } from '../features/questions/QuestionDetailPage';
import { QuestionFormPage } from '../features/questions/QuestionFormPage';
import { QuestionListPage } from '../features/questions/QuestionListPage';
import { AppShell } from './AppShell';
import { NotFoundPage, RouteError } from './pages';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <QuestionListPage /> },
          { path: 'questions/new', element: <QuestionFormPage mode="create" /> },
          { path: 'questions/:id', element: <QuestionDetailPage /> },
          { path: 'questions/:id/edit', element: <QuestionFormPage mode="edit" /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
