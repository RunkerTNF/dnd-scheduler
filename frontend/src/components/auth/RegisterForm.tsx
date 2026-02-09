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

const registerSchema = z.object({
  name: z.string().max(50, 'Имя слишком длинное (максимум 50 символов)').optional(),
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Пароль должен быть не менее 8 символов'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Пароли не совпадают',
  path: ['confirmPassword'],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (response) => {
      setAuth(response.data.user, response.data.accessToken);
      const redirectTo = searchParams.get('redirect') || '/groups';
      navigate(redirectTo);
    },
    onError: (error: any) => {
      setServerError(error.response?.data?.detail || 'Не удалось зарегистрироваться');
    },
  });

  const onSubmit = (data: RegisterFormData) => {
    setServerError(null);
    const { confirmPassword, ...registerData } = data;
    registerMutation.mutate(registerData);
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

      <Input
        label="Имя (необязательно)"
        type="text"
        placeholder="Иван Иванов"
        error={errors.name?.message}
        {...register('name')}
      />

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

      <PasswordInput
        label="Подтвердите пароль"
        placeholder="••••••••"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <Button
        type="submit"
        className="w-full"
        isLoading={registerMutation.isPending}
      >
        Создать аккаунт
      </Button>
    </form>
  );
}
