import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/auth';
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
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (_response, variables) => {
      setSentEmail(variables.email);
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail;
      if (detail === 'email_exists') {
        setServerError('Аккаунт с таким email уже существует');
      } else {
        setServerError(detail || 'Не удалось зарегистрироваться');
      }
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => authApi.resendVerification(sentEmail!),
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

  if (sentEmail) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">Письмо отправлено!</p>
          <p className="mt-1 text-sm text-green-700">
            Проверьте почту <span className="font-semibold">{sentEmail}</span> и перейдите по ссылке для подтверждения.
          </p>
        </div>
        <p className="text-sm text-gray-500">
          Не пришло письмо?{' '}
          <button
            type="button"
            onClick={() => resendMutation.mutate()}
            disabled={resendMutation.isPending || resendMutation.isSuccess}
            className="text-indigo-600 hover:underline disabled:opacity-50"
          >
            {resendMutation.isSuccess ? 'Отправлено!' : 'Отправить повторно'}
          </button>
        </p>
      </div>
    );
  }

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
