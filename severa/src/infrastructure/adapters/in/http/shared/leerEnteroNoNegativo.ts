// Un parámetro de paginado: ausente (se usa el valor por defecto) o un entero
// no negativo escrito solo con dígitos. Devuelve null si vino otra cosa.
export function leerEnteroNoNegativo(valor: unknown): number | undefined | null {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string' || !/^\d{1,9}$/.test(valor)) return null;
  return Number(valor);
}
