import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { authApi } from '../../api/auth';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const forgotSchema = z.object({
  email: z.string().email('Некорректный email'),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({ resolver: zodResolver(forgotSchema) });

  const forgotMutation = useMutation({
    mutationFn: authApi.forgotPassword,
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-purple-100 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Восстановление пароля</h1>
          <p className="text-gray-600 text-sm">
            Пришлём ссылку для установки нового пароля.
          </p>
        </div>

        {forgotMutation.isSuccess ? (
          <div className="rounded-md bg-green-50 p-4">
            <p className="text-sm text-green-800">
              Если такой адрес зарегистрирован, письмо со ссылкой уже отправлено.
              Проверьте почту, в том числе папку со спамом.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit((data) => forgotMutation.mutate(data))}
            className="space-y-4"
          >
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Button type="submit" className="w-full" isLoading={forgotMutation.isPending}>
              Отправить ссылку
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}
