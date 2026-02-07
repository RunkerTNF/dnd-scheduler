import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function RootRedirect() {
  const token = useAuthStore((state) => state.token);
  return <Navigate to={token ? '/groups' : '/login'} replace />;
}
