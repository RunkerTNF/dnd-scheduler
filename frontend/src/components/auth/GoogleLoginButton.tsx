import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';

export default function GoogleLoginButton() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [error, setError] = useState<string | null>(null);

  const googleAuthMutation = useMutation({
    mutationFn: authApi.googleAuth,
    onSuccess: (response) => {
      setAuth(response.data.user, response.data.accessToken);
      const redirectTo = searchParams.get('redirect') || '/groups';
      navigate(redirectTo);
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Ошибка авторизации через Google');
    },
  });

  return (
    <div>
      {error && (
        <div className="rounded-md bg-red-50 p-3 mb-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <GoogleLogin
        onSuccess={(credentialResponse) => {
          setError(null);
          if (credentialResponse.credential) {
            googleAuthMutation.mutate({ idToken: credentialResponse.credential });
          }
        }}
        onError={() => {
          setError('Авторизация через Google отменена');
        }}
        width="100%"
      />
    </div>
  );
}
