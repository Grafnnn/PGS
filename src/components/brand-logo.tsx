import Link from "next/link";

type BrandLogoProps = {
  href?: "/dashboard" | "/login" | null;
  compact?: boolean;
};

export function BrandWordmark({ decorative = false }: { decorative?: boolean }) {
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "PGS Studio"}
      className="brand-wordmark"
      role={decorative ? undefined : "img"}
    />
  );
}

export function BrandLogo({ href = "/dashboard", compact = false }: BrandLogoProps) {
  const content = (
    <>
      <BrandWordmark />
      {!compact && <span className="brand-subtitle">Система управления строительством</span>}
    </>
  );

  if (!href) {
    return <div className="brand brand-lockup">{content}</div>;
  }

  return (
    <Link className="brand brand-lockup" href={href}>
      {content}
    </Link>
  );
}
