import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Estado local que vuelve a `source` cada vez que `source` cambia (p. ej. el texto de un
 * buscador que refleja la URL: el botón atrás lo actualiza, escribir no toca la URL). Usa el
 * patrón de React "ajustar el estado durante el render" en vez de un efecto que pinta dos veces.
 */
export function useSyncedState<T>(source: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(source);
  const [prev, setPrev] = useState(source);
  if (!Object.is(prev, source)) {
    setPrev(source);
    setValue(source);
  }
  return [value, setValue];
}
