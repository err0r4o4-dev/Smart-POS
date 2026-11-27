import type { ReactNode } from 'react';
import './discovery.css';

export function DiscoveryHero({
  title,
  description,
  image = '/images/home/reference/hero-meal.webp',
  compact = false,
  children,
}: {
  title: string;
  description: string;
  image?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      className={`discovery-hero${compact ? ' discovery-hero-compact' : ''}`}
      aria-labelledby="discovery-title"
    >
      <div className="discovery-hero-copy">
        <h1 id="discovery-title" tabIndex={-1}>
          {title}
        </h1>
        <p>{description}</p>
        {children}
      </div>
      {!compact && <img className="discovery-hero-art" src={image} alt="" />}
    </section>
  );
}

