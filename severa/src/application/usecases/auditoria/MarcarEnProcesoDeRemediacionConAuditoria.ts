import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { MarcarEnProcesoDeRemediacionUseCase } from '../../ports/in/MarcarEnProcesoDeRemediacionUseCase';
import { AuditoriaRepository } from '../../ports/out/AuditoriaRepository';

// RF-94: registra quién cambió el estado de una vulnerabilidad y cuándo. No
// implementa MarcarEnProcesoDeRemediacionUseCase porque necesita un dato que
// esa interfaz no tiene (quién ejecuta la acción) — ese dato solo existe en
// la capa HTTP (el token verificado), así que el controller se lo pasa
// explícitamente en vez de que el decorador lo adivine.
export class MarcarEnProcesoDeRemediacionConAuditoria {
  constructor(
    private readonly usecase: MarcarEnProcesoDeRemediacionUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(cve: string, analistaId: string): Promise<Vulnerabilidad | null> {
    const resultado = await this.usecase.ejecutar(cve);

    if (resultado) {
      await this.auditoriaRepository.registrar({
        usuario: analistaId,
        accion: 'CambioEstadoRemediacion',
        detalle: `${resultado.cve.valor}: -> EnProceso`
      });
    }

    return resultado;
  }
}
