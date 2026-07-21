/**
 * Primary-nav active matcher. Overview is `/` with exact match, plus `/overview/*`
 * children. Other items use prefix matching (same as NavLink without `end`).
 */
export function isPrimaryNavActive(path: string, pathname: string): boolean {
  if (path === '/') {
    return pathname === '/' || pathname.startsWith('/overview');
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
