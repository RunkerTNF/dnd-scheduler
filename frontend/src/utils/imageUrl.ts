const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Превращает путь к изображению в полный URL.
 * Пути /uploads/* используются как есть (статические файлы).
 * Остальные относительные пути дополняются базовым URL API.
 */
export function resolveImageUrl(image: string | null | undefined): string {
  if (!image) return '';
  if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('data:')) {
    return image;
  }
  // Статические файлы (/uploads) не требуют /api префикса
  if (image.startsWith('/uploads/')) {
    return image;
  }
  return `${API_BASE}${image}`;
}
