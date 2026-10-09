import { normalizarTexto } from './DetectorDeTipoDeColumna';

// Palabras de un nombre de columna, normalizadas (minúsculas, sin tildes).
// Nació en VocabularioDeDominioGenerico.ts (RF-134) y se movió acá cuando
// RF-110 (variable objetivo) necesitó leer nombres de columna con el mismo
// criterio.
//
// normalizarTexto ya deja "ñ" como "n" (NFD decompone la tilde combinable y
// RANGO_DIACRITICOS_COMBINABLES la elimina, igual que con cualquier acento)
// — el separador de tokens no necesita conocer "ñ" como caso especial.
//
// Antes de normalizar (que pasa todo a minúsculas) se separan las palabras
// pegadas por mayúsculas: "FechaVenta" y "idCliente" son dos tokens cada una,
// igual que "fecha_venta" e "id_cliente". Sin esto, un Excel con encabezados
// en PascalCase — lo más común — no aportaba ninguna de sus palabras, y
// "FechaVenta" no contaba como evidencia de que la tabla es de ventas.
export function tokenizarNombreDeColumna(nombreColumna: string): string[] {
  const conPalabrasSeparadas = nombreColumna
    .replace(/(\p{Ll}|\d)(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2');
  return normalizarTexto(conPalabrasSeparadas)
    .split(/[^a-z]+/)
    .filter((token) => token.length > 0);
}
