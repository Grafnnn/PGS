import Link from "next/link";

type BrandLogoProps = {
  href?: "/dashboard" | "/login";
  compact?: boolean;
};

export function BrandLogo({ href = "/dashboard", compact = false }: BrandLogoProps) {
  const content = (
    <>
      <span className="brand-mark" aria-hidden="true">
        PG
      </span>
      <span className="brand-copy">
        <span className="brand-name">PGS Studio</span>
        {!compact && <span className="brand-subtitle">Construction command system</span>}
      </span>
    </>
  );

  if (!href) {
    return <div className="brand">{content}</div>;
  }

  return (
    <Link className="brand" href={href}>
      {content}
    </Link>
  );
}
