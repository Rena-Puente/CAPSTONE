export const CANDIDATE_USER_TYPE = 1;
export const ADMIN_USER_TYPE = 2;
export const COMPANY_USER_TYPE = 3;

export const ADMIN_DASHBOARD_ROUTE = '/companies/create';
export const COMPANY_DASHBOARD_ROUTE = '/companies';

export function resolveDefaultRouteForUserType(userType: number | null): string | null {
  switch (userType) {
    case ADMIN_USER_TYPE:
      return ADMIN_DASHBOARD_ROUTE;
    case COMPANY_USER_TYPE:
      return COMPANY_DASHBOARD_ROUTE;
    default:
      return null;
  }
}
