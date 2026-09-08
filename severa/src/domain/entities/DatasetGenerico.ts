import { CriterioDeClasificacionValue } from '../shared/value-objects/CriterioDeClasificacion';

// Generalización de M-03 (RF-17/18/21/23, flujo persistido): a diferencia de
// Vulnerabilidad, no asume ninguna columna fija — `columnas` es la lista de
// nombres tal como vinieron en el archivo, y cada registro real vive aparte
// en RegistroDatasetGenerico. `preset` queda reservado para cuando el
// analista active el preset de ciberseguridad (Anexo D del SDS) sobre este
// mismo pipeline; por ahora siempre es null (nadie lo escribe todavía).
//
// `criterioClasificacion` (RF-139, M-09) y `columnaClave` (pendiente de M-03)
// se agregan juntos porque comparten la misma plomería (migración 012,
// PATCH /analisis-datos/:datasetId/criterio-clasificacion) aunque sean
// conceptos distintos: columnaClave identifica la fila, criterioClasificacion
// dice por qué valor se prioriza. Ambos null hasta que el analista los
// configure explícitamente — no hay default inventado.
//
// `hashOriginalSha256` (RF-135, M-12, migración 013): hash SHA-256 del
// archivo tal como se subió, calculado en AnalizarDatasetGenerico.ejecutar()
// ANTES de parsearlo — permite comprobar más adelante que un archivo
// (re-subido para comparar, ver VerificarIntegridadDataset.ts) es
// byte-a-byte el mismo que el original. SEVERA no conserva el archivo en sí
// (decisión confirmada: guardar blobs es una superficie de almacenamiento
// nueva sin precedente en este proyecto) — solo el hash, así que la
// verificación siempre requiere volver a aportar el archivo a comparar.
// null en datasets importados antes de esta migración (no hay forma honesta
// de calcular un hash retroactivo de un archivo que ya no existe en disco).
export class DatasetGenerico {
  constructor(
    public readonly id: string,
    public readonly analistaId: string,
    public readonly nombreArchivo: string,
    public readonly columnas: string[],
    public readonly fuente: string,
    public readonly preset: string | null,
    public readonly filasDuplicadas: number,
    public readonly fechaCarga: Date = new Date(),
    public readonly criterioClasificacion: CriterioDeClasificacionValue | null = null,
    public readonly columnaClave: string | null = null,
    public readonly hashOriginalSha256: string | null = null
  ) {}
}
