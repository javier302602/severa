import { EscalaDeClasificacionRepository } from '../../src/application/ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { EscalaDeClasificacion } from '../../src/domain/shared/value-objects/EscalaDeClasificacion';

// Doble de prueba: una escala por analista, como la tabla de la migración 019
// (ver tests/integration/PostgresEscalaDeClasificacionRepository.integration.test.ts).
export class EscalaDeClasificacionRepositoryEnMemoria implements EscalaDeClasificacionRepository {
  readonly escalas = new Map<string, EscalaDeClasificacion>();

  async obtener(analistaId: string): Promise<EscalaDeClasificacion | null> {
    return this.escalas.get(analistaId) ?? null;
  }

  async guardar(analistaId: string, escala: EscalaDeClasificacion): Promise<void> {
    this.escalas.set(analistaId, escala);
  }

  async eliminar(analistaId: string): Promise<void> {
    this.escalas.delete(analistaId);
  }
}
