import React from 'react';

interface PublicPageBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Shared public-website background used across all public SchoolCare pages.
 * Reuses the homepage hero image with a subtle navy overlay for readability.
 * The image is rendered once as a fixed layer to avoid repeated loads/layout shift.
 */
export const PublicPageBackground: React.FC<PublicPageBackgroundProps> = ({ children, className = '' }) => {
  return (
    <div className={`public-site-bg relative min-h-screen overflow-x-hidden ${className}`.trim()}>
      <div className="public-site-bg__media" aria-hidden="true">
        <img
          src="/images/esrubengera/welcome.webp"
          alt=""
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="public-site-bg__image"
        />
        <div className="public-site-bg__overlay" />
      </div>
      <div className="relative z-[1] flex min-h-screen flex-col">{children}</div>
    </div>
  );
};
