// Identidad del responsable de la plataforma. Los valores entre [CORCHETES] son
// marcadores que el dueño debe llenar antes del lanzamiento (ver docs/legal/README.md).

export interface Operator {
  brand: 'Fersua Studio';
  legalName: string;
  docLabel: string;
  docNumber: string;
  address: string;
  city: string;
  email: string;
  phone: string;
}

export const OPERATOR: Operator = {
  brand: 'Fersua Studio',
  legalName: '[NOMBRE O RAZÓN SOCIAL]',
  docLabel: '[NIT/CC]',
  docNumber: '[NÚMERO]',
  address: '[DIRECCIÓN]',
  city: 'Medellín, Colombia',
  email: '[CORREO DE CONTACTO]',
  phone: '[TELÉFONO]',
};

/** true mientras quede algún marcador sin llenar (útil para un aviso en desarrollo). */
export const OPERATOR_HAS_PLACEHOLDERS = Object.values(OPERATOR).some((v) => v.includes('['));
