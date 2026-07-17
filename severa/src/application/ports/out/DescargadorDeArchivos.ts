export interface ArchivoDescargado {
  contenido: Buffer;
  contentType: string | null;
  // URL final tras seguir redirecciones — se usa para validar la extensión
  // cuando el Content-Type que manda el servidor remoto es genérico
  // (ej. application/octet-stream, común en Dropbox/Google).
  urlFinal: string;
}

// La URL que recibe descargar() ya pasó por DetectorDeTipoDeLink (dominio) y
// se asume perteneciente a un host de la allowlist — este puerto es
// responsable de la segunda línea de defensa: resolver DNS, verificar que la
// IP no sea privada/loopback/link-local, aplicar límites de tamaño/timeout, y
// revalidar cada redirección contra la misma allowlist antes de seguirla.
export interface DescargadorDeArchivos {
  descargar(url: string): Promise<ArchivoDescargado>;
}
