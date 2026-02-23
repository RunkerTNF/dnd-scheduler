import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { useMutation } from '@tanstack/react-query';

type State = 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [pageState, setPageState] = useState<State>('loading');
  const [resendEmail, setResendEmail] = useState('');
  const called = useRef(false);

  const resendMutation = useMutation({
    mutationFn: () => authApi.resendVerification(resendEmail),
  });

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setPageState('error');
      return;
    }

    authApi.verifyEmail(token)
      .then((response) => {
        setAuth(response.data.user, response.data.accessToken);
        setPageState('success');
        setTimeout(() => navigate('/groups'), 3000);
      })
      .catch(() => {
        setPageState('error');
      });
  }, []);

  if (pageState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-gray-600">Подтверждаем email…</p>
        </div>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="max-w-sm w-full rounded-xl bg-white p-8 shadow text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Email подтверждён!</h2>
          <p className="mt-2 text-sm text-gray-500">Перенаправляем в приложение…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="max-w-sm w-full rounded-xl bg-white p-8 shadow text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Ссылка недействительна</h2>
        <p className="mt-2 text-sm text-gray-500">
          Ссылка истекла или уже была использована.
        </p>
        <div className="mt-6 space-y-3">
          <div>
            <input
              type="email"
              placeholder="Введите ваш email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={() => resendMutation.mutate()}
            disabled={!resendEmail || resendMutation.isPending || resendMutation.isSuccess}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {resendMutation.isSuccess ? 'Письмо отправлено!' : 'Отправить новое письмо'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Войти
          </button>
        </div>
      </div>
    </div>
  );
}
