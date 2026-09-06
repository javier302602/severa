// Mejora 4 (Análisis de Datos General) — Fase 3. Forma deliberadamente
// idéntica a ResultadoLecturaGenerica (LectorDatasetGenerico.ts) pero
// definida acá en vez de importada desde infraestructura: un puerto no debe
// depender de un adapter concreto (mismo criterio que el resto de
// application/ports/out — ver VulnerabilidadRepository.ts). Las filas ya
// parseadas quedan en memoria del proceso, no el archivo crudo: evita
// re-leer/re-parsear el Excel/CSV en cada acceso de las Fases 3/4.
export interface DatosDataset {
  columnas: string[];
  filas: Array<Record<string, unknown>>;
}

// `crear` nunca recibe ni expone quién es el dueño de la sesión más allá de
// `analistaId`: es responsabilidad exclusiva de la implementación de este
// puerto verificar que `obtener` solo devuelva datos al mismo analista que
// los creó. El llamador SIEMPRE debe pasar el id que sale del token
// (req.analistaAutenticado.id), nunca uno recibido en el body/query/params
// — ver AnalisisDatasetController.ts.
export interface SesionAnalisisStore {
  crear(analistaId: string, datos: DatosDataset): string;
  // undefined cubre, sin distinguirlos, los tres casos: sesionId
  // inexistente, expirado, o perteneciente a otro analistaId — el llamador
  // los traduce todos al mismo 404 (SesionAnalisisNoEncontradaError), nunca
  // a un 403 que confirmaría que el id existe.
  obtener(analistaId: string, sesionId: string): DatosDataset | undefined;
}
