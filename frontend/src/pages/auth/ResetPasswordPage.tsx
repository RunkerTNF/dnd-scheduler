import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import PasswordInput from '../../components/ui/PasswordInput';
import Button from '../../components/ui/Button';

const resetSchema = z
  .object({
    password: z.string().min(8, 'Минимум 8 символов'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

type ResetFormData = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);
  const token = searchParams.get('token');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>({ resolver: zodResolver(resetSchema) });

  const resetMutation = useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: (response) => {
      setAuth(response.data.user, response.data.accessToken);
      navigate('/groups', { replace: true });
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail;
      setServerError(
        detail === 'invalid_or_expired_token'
          ? 'Ссылка истекла или уже использована. Запросите новую на странице восстановления.'
          : 'Не удалось задать пароль'
      );
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Ссылка неполная</h1>
          <p className="mt-2 text-sm text-gray-500">
            В адресе нет токена. Откройте ссылку из письма целиком.
          </p>
          <Link
            to="/forgot-password"
            className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Запросить новое письмо
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-purple-100 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Новый пароль</h1>
          <p className="text-gray-600 text-sm">
            Задайте пароль — дальше вход будет по email и паролю.
          </p>
        </div>

        {serverError && (
          <div className="rounded-md bg-red-50 p-3 mb-4">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <form
          onSubmit={handleSubmit((data) =>
            resetMutation.mutate({ token, password: data.password })
          )}
          className="space-y-4"
        >
          <PasswordInput
            label="Пароль"
            placeholder="••••••••"
            error={errors.password?.message}
            {...register('password')}
          />

          <PasswordInput
            label="Повторите пароль"
            placeholder="••••••••"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <Button type="submit" className="w-full" isLoading={resetMutation.isPending}>
            Сохранить пароль
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}
