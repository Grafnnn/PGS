import Link from "next/link";

type BrandLogoProps = {
  href?: "/dashboard" | "/login";
  compact?: boolean;
};

export function BrandLogo({ href = "/dashboard", compact = false }: BrandLogoProps) {
  const content = (
    <>
      <span className="brand-mark" aria-hidden="true">
        P
      </span>
      <span className="brand-copy">
        <span className="brand-name">PGS</span>
        {!compact && <span className="brand-subtitle">Construction OS</span>}
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
