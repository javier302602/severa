import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';
import {
  GuardarEscalaDeClasificacionUseCase,
  RestablecerEscalaDeClasificacionUseCase,
  ResultadoCambioDeEscala
} from '../../../ports/in/module_priorizacion_clasificacion/EscalaDeClasificacionUseCases';
import { CortesDeClasificacion } from '../../../../domain/shared/value-objects/EscalaDeClasificacion';

// RF-28 / RF-69: cambiar la escala cambia cómo se clasifica todo el catálogo
// del analista (filtros, ranking, plazos, informes), así que queda en la
// auditoría con la escala anterior y la nueva. Un pedido que no cambia nada
// no se audita.
function auditar(auditoriaRepository: AuditoriaRepository, analistaId: string, accion: string, resultado: ResultadoCambioDeEscala) {
  return auditoriaRepository.registrar({
    usuario: analistaId,
    accion,
    detalle: `${resultado.anterior.escala.describir()} → ${resultado.escala.describir()}`
  });
}

export class GuardarEscalaDeClasificacionConAuditoria implements GuardarEscalaDeClasificacionUseCase {
  constructor(
    private readonly usecase: GuardarEscalaDeClasificacionUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(analistaId: string, cortes: CortesDeClasificacion): Promise<ResultadoCambioDeEscala> {
    const resultado = await this.usecase.ejecutar(analistaId, cortes);
    if (resultado.huboCambio) await auditar(this.auditoriaRepository, analistaId, 'ConfigurarEscalaDeClasificacion', resultado);
    return resultado;
  }
}

export class RestablecerEscalaDeClasificacionConAuditoria implements RestablecerEscalaDeClasificacionUseCase {
  constructor(
    private readonly usecase: RestablecerEscalaDeClasificacionUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(analistaId: string): Promise<ResultadoCambioDeEscala> {
    const resultado = await this.usecase.ejecutar(analistaId);
    if (resultado.huboCambio) await auditar(this.auditoriaRepository, analistaId, 'RestablecerEscalaDeClasificacion', resultado);
    return resultado;
  }
}
