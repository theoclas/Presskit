import { Outlet } from 'react-router';
import { AuthProvider } from './AuthProvider';

/**
 * Layout (diferido) de las rutas con sesión o de cuenta: login, registro, recuperar,
 * restablecer, verificar correo, cambiar clave, panel, admin y vista previa. Un solo
 * AuthProvider para todas, así pasar de /login (o /registro) a /panel no repite el arranque.
 * Aquí entra axios por primera vez: el bundle público no lo carga.
 */
export function AuthRoot() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export default AuthRoot;
