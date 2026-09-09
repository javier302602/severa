import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { ConsultarVulnerabilidadPorCVEUseCase } from '../../ports/in/module_priorizacion_clasificacion/ConsultarVulnerabilidadPorCVEUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';

// RF-26 (M-04, retoma): cerrado sin cambios funcionales — análisis explícito,
// no un olvido. A diferencia de RF-27/28/30 (donde SÍ había varias variables
// reales compitiendo por el lugar: cvssScore vs. diasParaParche, severidad
// vs. tipoAcceso vs. estadoRemediacion), acá no existe una segunda variable
// "identificador" candidata — `id` es una PK interna (SERIAL) que el
// analista nunca busca a mano, y `cve` es el único identificador de negocio
// real del catálogo. Generalizar "elegí qué campo usar como identificador"
// sería una abstracción de una sola opción, sin nada real detrás. La
// "generalización" que pedía el SDS para este RF ya está satisfecha por el
// renombre/reencuadre del propio RF; no hay código pendiente que escribir
// acá (ver auditoría de retoma de M-04).
//
// RF-84 (M-11, retoma): mismo cierre, por el mismo motivo — "búsqueda rápida
// por identificador" ya está satisfecha por ESTE endpoint (GET /vulnerabilidades/:cve,
// lookup directo O(1) vía UNIQUE(analista_id, cve)). Existe un segundo camino
// equivalente, GET /vulnerabilidades/buscar?cve=X (BusquedaController.ts,
// M-11), con la misma comparación exacta y el mismo índice — no es una
// duplicación a resolver, son dos entradas HTTP distintas al mismo criterio
// (ficha completa vs. resultado dentro del filtro combinable). Ninguno de
// los dos cambia en esta retoma.

export class ConsultarVulnerabilidadPorCVE implements ConsultarVulnerabilidadPorCVEUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(cve: string, analistaId: string): Promise<Vulnerabilidad | null> {
    return this.vulnerabilidadRepository.buscarPorCve(cve, analistaId);
  }
}
