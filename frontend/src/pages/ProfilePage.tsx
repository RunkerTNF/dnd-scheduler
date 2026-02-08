import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { usersApi } from "../api/users";
import Input from "../components/ui/Input";
import PasswordInput from "../components/ui/PasswordInput";
import Button from "../components/ui/Button";
import {
  ArrowLeftIcon,
  UserCircleIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { resolveImageUrl } from "../utils/imageUrl";

const profileSchema = z.object({
  name: z.string().max(50, "Имя слишком длинное (максимум 50 символов)").optional(),
  imageUrl: z
    .union([z.string().url("Некорректный URL").optional(), z.literal("")])
    .optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль"),
    newPassword: z.string().min(8, "Пароль должен быть не менее 8 символов"),
    confirmPassword: z
      .string()
      .min(8, "Пароль должен быть не менее 8 символов"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string>(
    resolveImageUrl(user?.image),
  );
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || "",
      imageUrl: user?.image || "",
    },
  });

  // Наблюдаем за именем для отображения в интерфейсе
  const watchedName = profileForm.watch("name");

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const profileMutation = useMutation({
    mutationFn: (data: { name?: string; image?: string }) =>
      usersApi.updateProfile(data),
    onSuccess: (response) => {
      const updatedUser = response.data;
      updateUser({ name: updatedUser.name, image: updatedUser.image });
      profileForm.setValue("imageUrl", updatedUser.image || "");
      setImagePreview(resolveImageUrl(updatedUser.image));
      setProfileSuccess(true);
      setProfileError(null);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (err: any) => {
      setProfileError(err.response?.data?.detail || "Не удалось сохранить");
      setProfileSuccess(false);
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file),
    onSuccess: (response) => {
      const updatedUser = response.data;
      updateUser({ image: updatedUser.image });
      profileForm.setValue("imageUrl", updatedUser.image || "");
      setImagePreview(resolveImageUrl(updatedUser.image));
      setProfileSuccess(true);
      setProfileError(null);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (err: any) => {
      setProfileError(
        err.response?.data?.detail || "Не удалось загрузить файл",
      );
      setProfileSuccess(false);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      usersApi.changePassword(data),
    onSuccess: () => {
      setPasswordSuccess(true);
      setPasswordError(null);
      passwordForm.reset();
      setTimeout(() => setPasswordSuccess(false), 3000);
    },
    onError: (err: any) => {
      setPasswordError(
        err.response?.data?.detail || "Не удалось сменить пароль",
      );
      setPasswordSuccess(false);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Проверка размера файла (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setProfileError('Файл слишком большой (максимум 5 МБ)');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    avatarMutation.mutate(file);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    profileForm.setValue("imageUrl", val);
    setImagePreview(val);
  };

  const handleProfileSubmit = (formData: ProfileFormData) => {
    setProfileError(null);
    profileMutation.mutate({
      name: formData.name || undefined,
      image: formData.imageUrl || undefined,
    });
  };

  const handlePasswordSubmit = (formData: PasswordFormData) => {
    setPasswordError(null);
    passwordMutation.mutate({
      currentPassword: formData.currentPassword,
      newPassword: formData.newPassword,
    });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <Link
            to="/groups"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Все группы
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Профиль</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Avatar preview */}
        <div className="bg-white rounded-lg shadow p-6 flex items-center space-x-4">
          {imagePreview ? (
            <img
              src={imagePreview}
              alt={watchedName || "Avatar"}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <UserCircleIcon className="h-16 w-16 text-gray-400" />
          )}
          <div>
            <p className="text-lg font-semibold text-gray-900">
              {watchedName || user.email}
            </p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>

        {/* Profile form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Основные данные</h2>
          <form
            onSubmit={profileForm.handleSubmit(handleProfileSubmit)}
            className="space-y-4"
          >
            <Input
              label="Отображаемое имя"
              placeholder="Как вас называть?"
              error={profileForm.formState.errors.name?.message}
              {...profileForm.register("name")}
            />

            {/* Avatar picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Аватарка
                {profileForm.formState.errors.imageUrl && (
                  <span className="text-red-600 ml-1">*</span>
                )}
              </label>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <PhotoIcon className="h-5 w-5 mr-2 text-gray-400" />
                  {avatarMutation.isPending ? "Загрузка..." : "Выбрать файл"}
                </button>
                <span className="text-sm text-gray-500">или</span>
                <input
                  type="text"
                  value={profileForm.watch("imageUrl") || ""}
                  onChange={handleUrlChange}
                  placeholder="https://example.com/avatar.jpg"
                  className={`flex-1 px-3 py-2 border rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    profileForm.formState.errors.imageUrl
                      ? "border-red-300"
                      : "border-gray-300"
                  }`}
                />
              </div>
              {profileForm.formState.errors.imageUrl && (
                <p className="mt-1 text-sm text-red-600">
                  {profileForm.formState.errors.imageUrl.message}
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                // Исправлено: добавлены допустимые типы файлов
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {profileError && (
              <p className="text-sm text-red-600">{profileError}</p>
            )}
            {profileSuccess && (
              <p className="text-sm text-green-600">Сохранено!</p>
            )}

            <Button type="submit" isLoading={profileMutation.isPending}>
              Сохранить
            </Button>
          </form>
        </div>

        {/* Password form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Сменить пароль</h2>
          <form
            onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}
            className="space-y-4"
          >
            <PasswordInput
              label="Текущий пароль"
              error={passwordForm.formState.errors.currentPassword?.message}
              {...passwordForm.register("currentPassword")}
            />
            <PasswordInput
              label="Новый пароль"
              error={passwordForm.formState.errors.newPassword?.message}
              {...passwordForm.register("newPassword")}
            />
            <PasswordInput
              label="Подтвердите новый пароль"
              error={passwordForm.formState.errors.confirmPassword?.message}
              {...passwordForm.register("confirmPassword")}
            />

            {passwordError && (
              <p className="text-sm text-red-600">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="text-sm text-green-600">Пароль изменён!</p>
            )}

            <Button type="submit" isLoading={passwordMutation.isPending}>
              Сменить пароль
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
