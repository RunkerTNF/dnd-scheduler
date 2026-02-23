import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import Input from '../ui/Input';
import PasswordInput from '../ui/PasswordInput';
import Button from '../ui/Button';

const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Введите пароль'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (response) => {
      setAuth(response.data.user, response.data.accessToken);
      const redirectTo = searchParams.get('redirect') || '/groups';
      navigate(redirectTo);
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail;
      if (detail === 'email_not_verified') {
        setUnverifiedEmail(getValues('email'));
        setServerError(null);
      } else {
        setUnverifiedEmail(null);
        setServerError(detail === 'invalid_credentials' ? 'Неверный email или пароль' : (detail || 'Не удалось войти'));
      }
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => authApi.resendVerification(unverifiedEmail!),
  });

  const onSubmit = (data: LoginFormData) => {
    setServerError(null);
    setUnverifiedEmail(null);
    loginMutation.mutate(data);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit(onSubmit)(e);
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      {serverError && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      {unverifiedEmail && (
        <div className="rounded-md bg-yellow-50 p-3">
          <p className="text-sm text-yellow-800">
            Email не подтверждён.{' '}
            <button
              type="button"
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending || resendMutation.isSuccess}
              className="font-medium underline hover:no-underline disabled:opacity-50"
            >
              {resendMutation.isSuccess ? 'Письмо отправлено!' : 'Отправить письмо повторно'}
            </button>
          </p>
        </div>
      )}

      <Input
        label="Email"
        type="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register('email')}
      />

      <PasswordInput
        label="Пароль"
        placeholder="••••••••"
        error={errors.password?.message}
        {...register('password')}
      />

      <Button
        type="submit"
        className="w-full"
        isLoading={loginMutation.isPending}
      >
        Войти
      </Button>
    </form>
  );
}
