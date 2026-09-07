const LARGO_MAXIMO_NOMBRE_ARCHIVO = 200;

// Extraído de DatasetController.ts (2026, generalización de M-03) para que
// AnalisisDatasetAnalizarController.ts lo reutilice sin duplicar lógica de
// saneo: el nombre original del archivo es texto libre provisto por quien lo
// sube (su propio nombre de archivo local), nunca debe poder inyectar un
// salto de línea en un registro de auditoría ni inflarlo con un nombre
// arbitrariamente largo.
export function sanearNombreDeArchivo(nombre: string): string {
  const sinSaltosDeLinea = nombre.replace(/[\r\n]+/g, ' ').trim();
  return sinSaltosDeLinea.slice(0, LARGO_MAXIMO_NOMBRE_ARCHIVO);
}
