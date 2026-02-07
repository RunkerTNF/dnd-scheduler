import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { joinApi } from '../api/groups';
import { useAuthStore } from '../store/authStore';

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const authToken = useAuthStore((state) => state.token);
  const [error, setError] = useState<string | null>(null);

  const joinMutation = useMutation({
    mutationFn: joinApi.join,
    onSuccess: (response) => {
      navigate(`/groups/${response.data.groupId}`);
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      if (detail === 'invalid') {
        setError('Invalid invite link');
      } else if (detail === 'expired') {
        setError('This invite link has expired');
      } else if (detail === 'no_uses') {
        setError('This invite link has no uses left');
      } else {
        setError('Failed to join group');
      }
    },
  });

  useEffect(() => {
    if (!authToken) {
      navigate(`/login?redirect=/join/${token}`);
      return;
    }

    if (token) {
      joinMutation.mutate({ token });
    }
  }, [token, authToken]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-purple-100">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
          <p className="text-red-600 text-lg font-medium mb-4">{error}</p>
          <Link to="/groups" className="text-indigo-600 hover:text-indigo-500 font-medium">
            Go to My Groups
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-purple-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Joining Group...</h2>
        <p className="text-gray-600">Please wait while we add you to the group</p>
      </div>
    </div>
  );
}
