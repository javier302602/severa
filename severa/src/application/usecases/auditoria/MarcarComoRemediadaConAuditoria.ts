import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { MarcarComoRemediadaUseCase } from '../../ports/in/MarcarComoRemediadaUseCase';
import { AuditoriaRepository } from '../../ports/out/AuditoriaRepository';

// RF-94: ver el comentario equivalente en MarcarEnProcesoDeRemediacionConAuditoria.
export class MarcarComoRemediadaConAuditoria {
  constructor(
    private readonly usecase: MarcarComoRemediadaUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(cve: string, analistaId: string): Promise<Vulnerabilidad | null> {
    const resultado = await this.usecase.ejecutar(cve, analistaId);

    if (resultado) {
      await this.auditoriaRepository.registrar({
        usuario: analistaId,
        accion: 'CambioEstadoRemediacion',
        detalle: `${resultado.cve.valor}: -> Remediada`
      });
    }

    return resultado;
  }
}
