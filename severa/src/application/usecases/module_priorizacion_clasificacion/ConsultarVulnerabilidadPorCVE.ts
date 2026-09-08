import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { ConsultarVulnerabilidadPorCVEUseCase } from '../../ports/in/module_priorizacion_clasificacion/ConsultarVulnerabilidadPorCVEUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';

// RF-26 (M-04): el SDS lo marca "generalizado" (ya no atado al formato
// CVE-AAAA-NNNNN), pero este caso de uso no cambió — sigue siendo búsqueda
// por CVE tal cual (ver IdentificadorCVE.ts, que sí exige ese formato).
// Pendiente real hasta auditar M-09, donde vive el código (ver doc de
// arquitectura, sección V).

export class ConsultarVulnerabilidadPorCVE implements ConsultarVulnerabilidadPorCVEUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(cve: string, analistaId: string): Promise<Vulnerabilidad | null> {
    return this.vulnerabilidadRepository.buscarPorCve(cve, analistaId);
  }
}
