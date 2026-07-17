import { HttpError } from '../api/httpClient';

// Varios endpoints estadísticos (resumen, frecuencias, el gráfico
// histogramaCvssAgrupado) devuelven 400 con este mensaje cuando el catálogo
// todavía no tiene ninguna vulnerabilidad cargada — un caso real y esperado
// (nadie importó el dataset todavía), no un error del usuario. Se distingue
// acá para mostrar un estado vacío con acción ("importá el dataset") en vez
// de un cartel de error genérico.
export function esCatalogoVacio(error: unknown): boolean {
  return error instanceof HttpError && error.status === 400 && error.message.includes('no puede estar vacía');
}
