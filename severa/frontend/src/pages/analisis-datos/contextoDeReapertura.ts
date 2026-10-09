import { createContext, useContext } from 'react';

// Cuando la sesión de análisis expira (30 minutos sin uso) el dataset sigue
// guardado. Si la página sabe de qué dataset se trata, ofrece reabrirlo en vez
// de pedir que se vuelva a subir el archivo. Va por contexto porque quien
// muestra el aviso (AvisoErrorSeccion) está varios niveles por debajo de quien
// sabe reabrir (AnalisisDatosPage), con cada sección de por medio.
export interface Reapertura {
  reabrir: () => void;
  reabriendo: boolean;
}

export const ContextoDeReapertura = createContext<Reapertura | null>(null);

export function useReapertura(): Reapertura | null {
  return useContext(ContextoDeReapertura);
}
