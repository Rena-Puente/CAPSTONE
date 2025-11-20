import { routes } from './app.routes';
import { guestGuard } from './guards/guest.guard';

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

  it('should expose login route protected by guestGuard', () => {
    const route = findRoute('auth/login');

    expect(route).toBeTruthy();
    expect(route?.canActivate).toBeDefined();
    expect(route?.canActivate).toContain(guestGuard);
  });

  it('should expose register route protected by guestGuard', () => {
    const route = findRoute('auth/register');

    expect(route).toBeTruthy();
    expect(route?.canActivate).toBeDefined();
    expect(route?.canActivate).toContain(guestGuard);
  });
});
