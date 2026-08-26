import { useSearchParams } from 'react-router-dom';
import {
  YANDEX_REDIRECT_KEY,
  YANDEX_STATE_KEY,
  buildYandexAuthUrl,
  yandexClientId,
} from '../../utils/yandexOAuth';

export default function YandexLoginButton() {
  const [searchParams] = useSearchParams();

  if (!yandexClientId) {
    return null;
  }

  const handleClick = () => {
    const state = crypto.randomUUID();
    sessionStorage.setItem(YANDEX_STATE_KEY, state);

    const redirect = searchParams.get('redirect');
    if (redirect) {
      sessionStorage.setItem(YANDEX_REDIRECT_KEY, redirect);
    } else {
      sessionStorage.removeItem(YANDEX_REDIRECT_KEY);
    }

    window.location.href = buildYandexAuthUrl(state);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center justify-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold">
        Я
      </span>
      Войти с Яндекс ID
    </button>
  );
}
