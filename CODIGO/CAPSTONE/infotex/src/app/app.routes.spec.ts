import { routes } from './app.routes';
import { guestGuard } from './guards/guest.guard';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';

function findRoute(path: string) {
  return routes.find((route) => route.path === path);
}

describe('App Routes', () => {
  it('should expose forgot-password route protected by guestGuard', () => {
    const route = findRoute('auth/forgot-password');

    expect(route).toBeTruthy();
    expect(route?.canActivate).toBeDefined();
    expect(route?.canActivate).toContain(guestGuard);
  });

  it('should expose reset-password route protected by guestGuard', () => {
    const route = findRoute('auth/reset-password');

    expect(route).toBeTruthy();
    expect(route?.canActivate).toBeDefined();
    expect(route?.canActivate).toContain(guestGuard);
  });

  it('should protect executive summary route with admin and auth guards', () => {
    const route = findRoute('admin/resumen-anual');

    expect(route).toBeTruthy();
    expect(route?.canActivate).toContain(authGuard);
    expect(route?.canActivate).toContain(adminGuard);
  });
});
