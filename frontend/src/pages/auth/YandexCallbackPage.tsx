import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { YANDEX_REDIRECT_KEY, YANDEX_STATE_KEY } from '../../utils/yandexOAuth';

const ERROR_MESSAGES: Record<string, string> = {
  yandex_auth_not_configured: 'Вход через Яндекс ID сейчас недоступен',
  invalid_yandex_code: 'Не удалось подтвердить вход. Попробуйте ещё раз',
  invalid_yandex_token: 'Не удалось подтвердить вход. Попробуйте ещё раз',
  yandex_email_missing: 'Яндекс не передал email. Разрешите доступ к почте и повторите вход',
  yandex_unavailable: 'Яндекс временно недоступен. Попробуйте позже',
};

export default function YandexCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [error, setError] = useState<string | null>(null);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    if (searchParams.get('error')) {
      setError('Вход через Яндекс ID отменён');
      return;
    }

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const savedState = sessionStorage.getItem(YANDEX_STATE_KEY);
    sessionStorage.removeItem(YANDEX_STATE_KEY);

    if (!code || !state || state !== savedState) {
      setError('Не удалось проверить запрос. Начните вход заново');
      return;
    }

    authApi
      .yandexAuth({ code })
      .then((response) => {
        setAuth(response.data.user, response.data.accessToken);
        const redirect = sessionStorage.getItem(YANDEX_REDIRECT_KEY);
        sessionStorage.removeItem(YANDEX_REDIRECT_KEY);
        navigate(redirect || '/groups', { replace: true });
      })
      .catch((err: any) => {
        const detail = err.response?.data?.detail;
        setError(ERROR_MESSAGES[detail] ?? 'Не удалось войти через Яндекс ID');
      });
  }, []);

  if (!error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-gray-600">Завершаем вход…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full rounded-xl bg-white p-8 shadow text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Вход не удался</h2>
        <p className="mt-2 text-sm text-gray-500">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          className="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Вернуться ко входу
        </button>
      </div>
    </div>
  );
}
