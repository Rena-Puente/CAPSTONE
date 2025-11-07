export const COMPANY_USER_TYPE = 3;
export const COMPANY_DASHBOARD_ROUTE = '/companies';

export function resolveDefaultRouteForUserType(userType: number | null): string | null {
  if (userType === COMPANY_USER_TYPE) {
    return COMPANY_DASHBOARD_ROUTE;
  }

  return null;
}