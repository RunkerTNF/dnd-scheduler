const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Превращает путь к изображению в полный URL.
 * Относительные пути (например /uploads/avatars/...) дополняются базовым URL API.
 */
export function resolveImageUrl(image: string | null | undefined): string {
  if (!image) return '';
  if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('data:')) {
    return image;
  }
  return `${API_BASE}${image}`;
}
