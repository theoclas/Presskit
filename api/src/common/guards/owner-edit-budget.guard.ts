import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../../auth/auth-user';
import { BoundedMap } from '../../auth/bounded-map';
import { Errors } from '../errors';
import { matchedPath } from './roles.guard';

/** H3 (docs/diseno/06): cambios del dueño por usuario en la ventana. */
export const OWNER_EDITS_PER_WINDOW = 60;
export const OWNER_EDIT_WINDOW_MS = 10 * 60_000;
/** Todo lo que cuelga de aquí es el perfil del dueño (editor, fotos, fechas, bandeja, envío). */
const OWNER_PREFIX = '/api/me/profile';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Presupuesto de cambios por usuario (ventana deslizante, en memoria: un solo proceso de api).
 * Cada cambio escribe una fila de auditoría y mueve el perfil; sin esto, una cuenta nueva sin
 * verificar podía escribir miles de filas por minuto repartiendo peticiones entre rutas (el
 * límite global es por IP y por ruta).
 */
@Injectable()
export class OwnerEditBudget {
  private clock: () => number = Date.now;
  private readonly hits = new BoundedMap<string, number[]>(20_000, OWNER_EDIT_WINDOW_MS, () => this.clock());

  /** true si el cambio entra en el presupuesto (y lo cuenta); false si ya no hay. */
  take(userId: string): boolean {
    const t = this.clock();
    const recent = (this.hits.get(userId) ?? []).filter((at) => at > t - OWNER_EDIT_WINDOW_MS);
    if (recent.length >= OWNER_EDITS_PER_WINDOW) {
      this.hits.set(userId, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(userId, recent);
    return true;
  }

  /** Solo pruebas: olvida lo contado (las e2e hacen muchos cambios con el mismo usuario). */
  resetForTesting(): void {
    this.hits.deleteWhere(() => true);
  }

  /** Solo pruebas: reloj propio. */
  setClockForTesting(now: () => number): void {
    this.clock = now;
  }
}

export function isOwnerMutation(method: string | undefined, path: string): boolean {
  if (SAFE_METHODS.has((method ?? 'GET').toUpperCase())) return false;
  const p = path.toLowerCase();
  return p === OWNER_PREFIX || p.startsWith(`${OWNER_PREFIX}/`);
}

/**
 * Global, después de RolesGuard (req.user ya viene de la BD): a un USER, cualquier método que
 * no sea de lectura bajo /api/me/profile le gasta presupuesto; sin presupuesto, 429. El admin
 * edita por /api/admin/profiles/... y no tiene este tope.
 */
@Injectable()
export class OwnerEditBudgetGuard implements CanActivate {
  constructor(private readonly budget: OwnerEditBudget) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user || req.user.role !== 'USER') return true;
    if (!isOwnerMutation(req.method, matchedPath(req))) return true;
    if (!this.budget.take(req.user.id)) {
      throw Errors.tooMany('Hiciste muchos cambios seguidos. Espera unos minutos y vuelve a intentarlo.');
    }
    return true;
  }
}
