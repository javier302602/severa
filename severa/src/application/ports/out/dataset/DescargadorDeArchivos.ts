export interface ArchivoDescargado {
  // Streaming a disco (2026-07-17, límite subido a 1GB): ya NO se junta todo
  // el contenido en un Buffer en memoria — se escribe directo a un archivo
  // temporal a medida que llega de la red (y se descomprime en el mismo
  // stream si es gzip). Quien llama es responsable de borrar este archivo
  // cuando termine (fs.unlink en un finally, mismo patrón que ya usaba
  // ImportarDatasetDesdeUrl.ts con SUS propios temporales).
  rutaArchivo: string;
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
