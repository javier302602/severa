import { httpClient } from './httpClient';
import type { NivelDeRiesgo } from './priorizacionService';

// RF-28 / RF-69 (Modo B). Contrato verificado contra
// EscalaDeClasificacionController.ts: la escala es siempre la del analista
// autenticado; no se manda ningún id.

// Dónde empieza cada nivel (Bajo empieza siempre en 0.0).
export interface CortesDeClasificacion {
  moderado: number;
  alto: number;
  critico: number;
}

// Un nivel como intervalo de CVSS: desde `minimo` (incluido) hasta
// `menorQue` (excluido), o hasta 10 si `menorQue` es null.
export interface RangoDeNivel {
  nivel: NivelDeRiesgo;
  minimo: number;
  menorQue: number | null;
}

export interface EscalaDeClasificacion {
  personalizada: boolean;
  cortes: CortesDeClasificacion;
  rangos: RangoDeNivel[];
  // Cómo se nombra la escala ("Escala CVSS (por defecto)", "Escala
  // personalizada: …").
  descripcion: string;
  cortesCvss: CortesDeClasificacion;
}

export const escalaService = {
  obtener: (): Promise<EscalaDeClasificacion> => httpClient.get('/escala-clasificacion'),
  guardar: (cortes: CortesDeClasificacion): Promise<EscalaDeClasificacion> => httpClient.put('/escala-clasificacion', cortes),
  volverACvss: (): Promise<EscalaDeClasificacion> => httpClient.delete('/escala-clasificacion')
};
