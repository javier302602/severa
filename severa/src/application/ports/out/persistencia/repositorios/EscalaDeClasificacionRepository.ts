import { EscalaDeClasificacion } from '../../../../../domain/shared/value-objects/EscalaDeClasificacion';

// RF-28 / RF-69 (Modo B), migración 019: una escala por analista. Sin fila,
// el analista usa la escala CVSS.
export interface EscalaDeClasificacionRepository {
  // null si el analista no configuró ninguna (usa la de CVSS).
  obtener(analistaId: string): Promise<EscalaDeClasificacion | null>;
  guardar(analistaId: string, escala: EscalaDeClasificacion): Promise<void>;
  // Vuelve a la escala CVSS.
  eliminar(analistaId: string): Promise<void>;
}
