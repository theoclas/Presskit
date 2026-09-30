import type { ExecutionContext } from '@nestjs/common';
import {
  OWNER_EDITS_PER_WINDOW,
  OWNER_EDIT_WINDOW_MS,
  OwnerEditBudget,
  OwnerEditBudgetGuard,
  isOwnerMutation,
} from './owner-edit-budget.guard';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return { getType: () => 'http', switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

const owner = (id = 'u1') => ({ id, role: 'USER' });

describe('OwnerEditBudgetGuard (H3: 60 cambios cada 10 min por dueño)', () => {
  it('solo cuentan los cambios bajo /api/me/profile', () => {
    expect(isOwnerMutation('PATCH', '/api/me/profile')).toBe(true);
    expect(isOwnerMutation('POST', '/api/me/profile/members/:id/order')).toBe(true);
    expect(isOwnerMutation('DELETE', '/API/ME/PROFILE/bookings/:id')).toBe(true);
    expect(isOwnerMutation('GET', '/api/me/profile')).toBe(false);
    expect(isOwnerMutation('HEAD', '/api/me/profile/bookings')).toBe(false);
    expect(isOwnerMutation('POST', '/api/me/profileX')).toBe(false);
    expect(isOwnerMutation('POST', '/api/auth/logout')).toBe(false);
    expect(isOwnerMutation('PATCH', '/api/admin/profiles/:profileId')).toBe(false);
  });

  it(`${OWNER_EDITS_PER_WINDOW} cambios por usuario en la ventana; el siguiente es 429 y la ventana se desliza`, () => {
    let now = 1_000_000;
    const budget = new OwnerEditBudget();
    budget.setClockForTesting(() => now);
    const guard = new OwnerEditBudgetGuard(budget);
    const req = { method: 'PATCH', route: { path: '/api/me/profile' }, user: owner() };
    for (let i = 0; i < OWNER_EDITS_PER_WINDOW; i++) expect(guard.canActivate(ctx(req))).toBe(true);
    expect(() => guard.canActivate(ctx(req))).toThrow(expect.objectContaining({ status: 429 }));
    // Otro dueño tiene su propio presupuesto; las lecturas no gastan.
    expect(guard.canActivate(ctx({ ...req, user: owner('u2') }))).toBe(true);
    expect(guard.canActivate(ctx({ ...req, method: 'GET' }))).toBe(true);
    now += OWNER_EDIT_WINDOW_MS + 1;
    expect(guard.canActivate(ctx(req))).toBe(true);
  });

  it('el admin y las rutas sin sesión no pasan por el presupuesto', () => {
    const budget = new OwnerEditBudget();
    const take = jest.spyOn(budget, 'take');
    const guard = new OwnerEditBudgetGuard(budget);
    expect(guard.canActivate(ctx({ method: 'PATCH', route: { path: '/api/me/profile' }, user: { id: 'a', role: 'ADMIN' } }))).toBe(true);
    expect(guard.canActivate(ctx({ method: 'POST', route: { path: '/api/me/profile' } }))).toBe(true);
    expect(take).not.toHaveBeenCalled();
  });
});
