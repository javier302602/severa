import { httpClient } from './httpClient';

// Contrato verificado contra ComparacionController.ts / ComparadorDeCategorias.ts.
// Los 3 endpoints devuelven la misma forma (compararGrupos), solo cambia qué
// dos grupos arma el backend antes de comparar.
//
// Campos nulos (2026-07-19, bug real: "no hay suficientes vulnerabilidades"
// aparecía aunque UN lado sí tuviera datos, ej. "Apache Log4j" con filas
// reales vs. "Nginx" sin ninguna): el backend ya no rechaza toda la
// comparación cuando un solo grupo está vacío — ese lado llega en null y el
// otro con sus datos reales, para mostrar "lo que hay" en vez de un error.
export interface ComparacionGrupos {
  mediaA: number | null;
  mediaB: number | null;
  diferenciaMedias: number | null;
  sdA: number | null;
  sdB: number | null;
}

export const comparacionService = {
  // /acceso no toma parámetros: el backend arma los grupos fijos
  // Remoto/Local a partir de TODO el catálogo (GET /comparacion/acceso).
  compararAcceso: (): Promise<ComparacionGrupos> => httpClient.get('/comparacion/acceso'),
  // categoriaA/categoriaB son query params opcionales — si no se mandan, el
  // backend usa sus propios defaults ('N/A' vs 'N/A' para /tipo, 'Apache
  // Log4j' vs 'Nginx' para /software). Se omiten si vienen vacíos para no
  // pisar esos defaults con un string vacío.
  compararTipo: (categoriaA?: string, categoriaB?: string): Promise<ComparacionGrupos> =>
    httpClient.get('/comparacion/tipo', { categoriaA: categoriaA || undefined, categoriaB: categoriaB || undefined }),
  compararSoftware: (categoriaA?: string, categoriaB?: string): Promise<ComparacionGrupos> =>
    httpClient.get('/comparacion/software', { categoriaA: categoriaA || undefined, categoriaB: categoriaB || undefined }),
  // Dropdown de software (2026-07-20): valores reales del catálogo del
  // analista, no una lista adivinada.
  listarSoftwareDisponible: (): Promise<string[]> => httpClient.get('/comparacion/software-disponible')
};
