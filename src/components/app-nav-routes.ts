export function isStandaloneAppSurface(pathname: string) {
  return pathname === "/login"
    || pathname === "/reset-password"
    || pathname.startsWith("/invite/")
    || pathname.startsWith("/external/respond/");
}
