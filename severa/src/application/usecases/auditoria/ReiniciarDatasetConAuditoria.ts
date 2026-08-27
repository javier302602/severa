import { ReiniciarDatasetUseCase, ResumenReinicioDataset } from '../../ports/in/ReiniciarDatasetUseCase';
import { AuditoriaRepository } from '../../ports/out/AuditoriaRepository';

// Mismo patrón que el resto de los decoradores de auditoría (ver
// ImportarDatasetConAuditoria.ts): el "quién" (analistaId) viene siempre del
// token, nunca del propio caso de uso. Se registra DESPUÉS de ejecutar el
// borrado (mismo orden que ImportarDatasetConAuditoria/MarcarComoRemediadaConAuditoria
// en este código base — auditar el resultado real, no la intención, para que
// el registro nunca diga algo que no llegó a pasar si la operación fallara a
// mitad de camino) y con el conteo real de filas eliminadas — precisamente
// "cuántos registros había antes de borrar", ya que después del DELETE la
// tabla queda vacía.
export class ReiniciarDatasetConAuditoria {
  constructor(
    private readonly usecase: ReiniciarDatasetUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(analistaId: string): Promise<ResumenReinicioDataset> {
    const resumen = await this.usecase.ejecutar(analistaId);

    await this.auditoriaRepository.registrar({
      usuario: analistaId,
      accion: 'ReiniciarDataset',
      detalle: `${resumen.eliminados} vulnerabilidad(es) propia(s) eliminada(s) al restablecer sus datos`
    });

    return resumen;
  }
}
