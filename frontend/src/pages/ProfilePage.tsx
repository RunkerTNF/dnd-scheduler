import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usersApi } from '../api/users';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { ArrowLeftIcon, UserCircleIcon, PhotoIcon } from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function resolveImageUrl(image: string | null | undefined): string {
  if (!image) return '';
  if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('data:')) {
    return image;
  }
  // Relative path from backend (e.g. /uploads/avatars/...)
  return `${API_BASE}${image}`;
}

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name || '');
  const [imageUrl, setImageUrl] = useState(user?.image || '');
  const [imagePreview, setImagePreview] = useState<string>(resolveImageUrl(user?.image));
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileMutation = useMutation({
    mutationFn: (data: { name?: string; image?: string }) =>
      usersApi.updateProfile(data),
    onSuccess: (response) => {
      const updatedUser = response.data;
      updateUser({ name: updatedUser.name, image: updatedUser.image });
      setImageUrl(updatedUser.image || '');
      setImagePreview(resolveImageUrl(updatedUser.image));
      setProfileSuccess(true);
      setProfileError(null);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (err: any) => {
      setProfileError(err.response?.data?.detail || 'Не удалось сохранить');
      setProfileSuccess(false);
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file),
    onSuccess: (response) => {
      const updatedUser = response.data;
      updateUser({ image: updatedUser.image });
      setImageUrl(updatedUser.image || '');
      setImagePreview(resolveImageUrl(updatedUser.image));
      setProfileSuccess(true);
      setProfileError(null);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (err: any) => {
      setProfileError(err.response?.data?.detail || 'Не удалось загрузить файл');
      setProfileSuccess(false);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      usersApi.changePassword(data),
    onSuccess: () => {
      setPasswordSuccess(true);
      setPasswordError(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    },
    onError: (err: any) => {
      setPasswordError(err.response?.data?.detail || 'Не удалось сменить пароль');
      setPasswordSuccess(false);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    // Upload
    avatarMutation.mutate(file);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setImageUrl(val);
    setImagePreview(val);
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    profileMutation.mutate({ name: name || undefined, image: imageUrl || undefined });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('Пароли не совпадают');
      return;
    }

    passwordMutation.mutate({ currentPassword, newPassword });
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
              alt={name || 'Avatar'}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <UserCircleIcon className="h-16 w-16 text-gray-400" />
          )}
          <div>
            <p className="text-lg font-semibold text-gray-900">{name || user.email}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>

        {/* Profile form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Основные данные</h2>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <Input
              label="Отображаемое имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как вас называть?"
            />

            {/* Avatar picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Аватарка</label>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <PhotoIcon className="h-5 w-5 mr-2 text-gray-400" />
                  {avatarMutation.isPending ? 'Загрузка...' : 'Выбрать файл'}
                </button>
                <span className="text-sm text-gray-500">или</span>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={handleUrlChange}
                  placeholder="https://example.com/avatar.jpg"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {profileError && <p className="text-sm text-red-600">{profileError}</p>}
            {profileSuccess && <p className="text-sm text-green-600">Сохранено!</p>}

            <Button type="submit" isLoading={profileMutation.isPending}>
              Сохранить
            </Button>
          </form>
        </div>

        {/* Password form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Сменить пароль</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input
              type="password"
              label="Текущий пароль"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <Input
              type="password"
              label="Новый пароль"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
            <Input
              type="password"
              label="Подтвердите новый пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />

            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            {passwordSuccess && <p className="text-sm text-green-600">Пароль изменён!</p>}

            <Button type="submit" isLoading={passwordMutation.isPending}>
              Сменить пароль
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
