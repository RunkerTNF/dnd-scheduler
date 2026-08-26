import { createBrowserRouter } from 'react-router-dom';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import YandexCallbackPage from './pages/auth/YandexCallbackPage';
import JoinPage from './pages/JoinPage';
import GroupsListPage from './pages/groups/GroupsListPage';
import GroupDetailPage from './pages/groups/GroupDetailPage';
import ProfilePage from './pages/ProfilePage';
import ProtectedRoute from './components/ProtectedRoute';
import RootRedirect from './components/RootRedirect';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/verify-email',
    element: <VerifyEmailPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/auth/yandex/callback',
    element: <YandexCallbackPage />,
  },
  {
    path: '/join/:token',
    element: <JoinPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        index: true,
        element: <RootRedirect />,
      },
      {
        path: 'groups',
        element: <GroupsListPage />,
      },
      {
        path: 'groups/:groupId',
        element: <GroupDetailPage />,
      },
      {
        path: 'profile',
        element: <ProfilePage />,
      },
    ],
  },
]);
