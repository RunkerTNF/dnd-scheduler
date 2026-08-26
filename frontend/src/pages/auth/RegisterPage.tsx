import { Link, useSearchParams } from 'react-router-dom';
import RegisterForm from '../../components/auth/RegisterForm';
import YandexLoginButton from '../../components/auth/YandexLoginButton';

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const loginLink = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-purple-100 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🎲 DnD Scheduler
          </h1>
          <p className="text-gray-600">Создайте аккаунт для начала работы</p>
        </div>

        <RegisterForm />

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Или войти через</span>
            </div>
          </div>

          <div className="mt-6">
            <YandexLoginButton />
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Уже есть аккаунт?{' '}
            <Link to={loginLink} className="font-medium text-indigo-600 hover:text-indigo-500">
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
