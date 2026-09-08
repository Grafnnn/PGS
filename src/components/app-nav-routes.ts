export function isStandaloneAppSurface(pathname: string) {
  return pathname === "/login"
    || pathname === "/design-contest"
    || pathname === "/reset-password"
    || pathname.startsWith("/invite/")
    || pathname.startsWith("/external/respond/");
}
