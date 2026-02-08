import { createBrowserRouter } from 'react-router-dom';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
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
