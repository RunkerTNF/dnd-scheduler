const YANDEX_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';

export const YANDEX_STATE_KEY = 'yandex-oauth-state';
export const YANDEX_REDIRECT_KEY = 'yandex-oauth-redirect';

export const yandexClientId: string = import.meta.env.VITE_YANDEX_CLIENT_ID || '';

/** Redirect URI должен совпадать с зарегистрированным в кабинете Яндекса. */
export function yandexRedirectUri(): string {
  return `${window.location.origin}/auth/yandex/callback`;
}

export function buildYandexAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: yandexClientId,
    redirect_uri: yandexRedirectUri(),
    state,
  });
  return `${YANDEX_AUTHORIZE_URL}?${params.toString()}`;
}
