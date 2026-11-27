import { useState } from 'react';

const coverPattern = /^\/images\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*[.](webp|jpg|jpeg|png|avif)$/;

export function ShopCoverImage({
  cover,
  fallback,
  loading,
}: {
  cover?: string;
  fallback: string;
  loading?: 'lazy' | 'eager';
}) {
  const [failedCover, setFailedCover] = useState<string>();
  const source =
    typeof cover === 'string' &&
    cover.length <= 300 &&
    coverPattern.test(cover) &&
    cover !== failedCover
      ? cover
      : fallback;
  return (
    <img
      src={source}
      alt=""
      loading={loading}
      onError={source === fallback ? undefined : () => setFailedCover(source)}
    />
  );
}
