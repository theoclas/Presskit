import type { AcceptTermsInput, LoginResultDto, MeDto, RegisterInput, SessionDto } from '@fersua/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  applySession,
  clearLocalSession,
  endLocalSession,
  getAccessToken,
  getSessionUser,
  hasSessionHint,
  http,
  onSessionEvent,
  refreshSession,
  setLoginRedirect,
  setSessionUser,
} from '../lib/http';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  user: MeDto | null;
  status: AuthStatus;
  login(username: string, password: string): Promise<LoginResultDto>;
  verifyMfa(mfaToken: string, code: string): Promise<void>;
  logout(): Promise<void>;
  refreshMe(): Promise<void>;
  /** Para respuestas que traen una sesión nueva (p. ej. cambiar la contraseña). */
  setSession(session: SessionDto): void;
  /**
   * POST /auth/register: la cuenta nace con sesión iniciada. Devuelve la sesión, o null si el
   * api respondió sin una (honeypot lleno: misma apariencia, pero no se creó nada).
   */
  register(input: RegisterInput): Promise<SessionDto | null>;
  /** POST /auth/accept-terms: re-aceptación de las versiones vigentes (MeDto.termsOutdated). */
  acceptTerms(input?: AcceptTermsInput): Promise<MeDto>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Rutas que solo tienen sentido con sesión: ahí se intenta el refresh aunque falte la marca. */
function isProtectedPath(path: string): boolean {
  return /^\/(admin|panel|cambiar-clave|_preview)(\/|$)/.test(path);
}

/** El registro con honeypot lleno responde 201 sin una sesión real: ahí no se aplica nada. */
function isSessionDto(v: unknown): v is SessionDto {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.accessToken === 'string' &&
    o.accessToken.length > 0 &&
    typeof o.expiresIn === 'number' &&
    !!o.user &&
    typeof o.user === 'object'
  );
}

interface State {
  status: AuthStatus;
  user: MeDto | null;
}

function initialState(): State {
  const user = getSessionUser();
  // Otra instancia ya abrió la sesión (el estado vive en lib/http, no en el componente).
  if (user && getAccessToken()) return { status: 'authenticated', user };
  return { status: 'loading', user: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const off = onSessionEvent((e) => {
      if (e.type === 'session') setState({ status: 'authenticated', user: e.session.user });
      else if (e.type === 'user') setState((s) => (s.user ? { status: 'authenticated', user: e.user } : s));
      else {
        // Sin sesión no debe quedar nada del admin en la caché (datos personales).
        queryClient.clear();
        setState({ status: 'anonymous', user: null });
      }
    });
    return off;
  }, [queryClient]);

  // Si la sesión vence en medio del admin, se navega con el router (sin recargar la página).
  useEffect(() => {
    setLoginRedirect((url) => navigate(url, { replace: true }));
    return () => setLoginRedirect(null);
  }, [navigate]);

  // Arranque: refresh silencioso solo si hay marca de sesión (o la ruta la exige). Así un
  // visitante anónimo nunca provoca un 401.
  useEffect(() => {
    if (getSessionUser() && getAccessToken()) return;
    if (!hasSessionHint() && !isProtectedPath(window.location.pathname)) {
      setState({ status: 'anonymous', user: null });
      return;
    }
    let alive = true;
    refreshSession().catch(() => {
      clearLocalSession();
      if (alive) setState({ status: 'anonymous', user: null });
    });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<LoginResultDto> => {
    const { data } = await http.post<LoginResultDto>('/auth/login', { username, password });
    if (!('mfaRequired' in data)) applySession(data);
    return data;
  }, []);

  const verifyMfa = useCallback(async (mfaToken: string, code: string): Promise<void> => {
    const { data } = await http.post<SessionDto>('/auth/mfa', { mfaToken, code });
    applySession(data);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await http.post('/auth/logout');
    } catch {
      // Aunque el api no responda, en este navegador la sesión se cierra igual.
    }
    // Emite 'cleared': el listener de arriba limpia la caché y pasa a anónimo.
    endLocalSession();
  }, []);

  const refreshMe = useCallback(async (): Promise<void> => {
    const { data } = await http.get<MeDto>('/auth/me');
    setSessionUser(data);
    setState({ status: 'authenticated', user: data });
  }, []);

  const setSession = useCallback((session: SessionDto) => applySession(session), []);

  const register = useCallback(async (input: RegisterInput): Promise<SessionDto | null> => {
    const { data } = await http.post<unknown>('/auth/register', input);
    if (!isSessionDto(data)) return null;
    applySession(data);
    return data;
  }, []);

  const acceptTerms = useCallback(
    async (input: AcceptTermsInput = { acceptTerms: true, acceptPrivacy: true }): Promise<MeDto> => {
      const { data } = await http.post<MeDto>('/auth/accept-terms', input);
      setSessionUser(data);
      setState({ status: 'authenticated', user: data });
      return data;
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      status: state.status,
      login,
      verifyMfa,
      logout,
      refreshMe,
      setSession,
      register,
      acceptTerms,
    }),
    [state, login, verifyMfa, logout, refreshMe, setSession, register, acceptTerms],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() necesita <AuthProvider>.');
  return ctx;
}
