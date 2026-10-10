import {
  EscalaVigente,
  GuardarEscalaDeClasificacionUseCase,
  ObtenerEscalaDeClasificacionUseCase,
  RestablecerEscalaDeClasificacionUseCase,
  ResultadoCambioDeEscala,
  VulnerabilidadClasificada
} from '../../ports/in/module_priorizacion_clasificacion/EscalaDeClasificacionUseCases';
import { EscalaDeClasificacionRepository } from '../../ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { CortesDeClasificacion, EscalaDeClasificacion } from '../../../domain/shared/value-objects/EscalaDeClasificacion';
import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

// RF-28 / RF-69 (M-04, M-09), "Modo B": el analista define los cortes de los
// niveles de riesgo de su catálogo; por defecto rige la escala CVSS. La
// columna `severidad` de la tabla no se reescribe nunca: la categoría con la
// escala del analista se calcula al consultar.

// La escala con la que se clasifica el catálogo de un analista. Es lo que
// usan todos los casos de uso que muestran o filtran por nivel de riesgo.
export async function escalaVigente(repositorio: EscalaDeClasificacionRepository, analistaId: string): Promise<EscalaVigente> {
  const guardada = await repositorio.obtener(analistaId);
  return guardada ? { escala: guardada, personalizada: true } : { escala: EscalaDeClasificacion.CVSS, personalizada: false };
}

export function clasificarConEscala(vulnerabilidades: Vulnerabilidad[], escala: EscalaDeClasificacion): VulnerabilidadClasificada[] {
  return vulnerabilidades.map((vulnerabilidad) => ({ vulnerabilidad, nivelDeRiesgo: escala.clasificar(vulnerabilidad.cvssScore.valor) }));
}

export class ObtenerEscalaDeClasificacion implements ObtenerEscalaDeClasificacionUseCase {
  constructor(private readonly repositorio: EscalaDeClasificacionRepository) {}

  ejecutar(analistaId: string): Promise<EscalaVigente> {
    return escalaVigente(this.repositorio, analistaId);
  }
}

export class GuardarEscalaDeClasificacion implements GuardarEscalaDeClasificacionUseCase {
  constructor(private readonly repositorio: EscalaDeClasificacionRepository) {}

  async ejecutar(analistaId: string, cortes: CortesDeClasificacion): Promise<ResultadoCambioDeEscala> {
    const escala = EscalaDeClasificacion.personalizada(cortes);
    const anterior = await escalaVigente(this.repositorio, analistaId);

    // Guardar exactamente los cortes de CVSS equivale a volver a la escala
    // por defecto: no se guarda una "personalizada" que no lo es.
    if (escala.esCvss) {
      if (anterior.personalizada) await this.repositorio.eliminar(analistaId);
      return { escala: EscalaDeClasificacion.CVSS, personalizada: false, anterior, huboCambio: anterior.personalizada };
    }
    if (anterior.personalizada && anterior.escala.esIgualA(escala)) {
      return { ...anterior, anterior, huboCambio: false };
    }
    await this.repositorio.guardar(analistaId, escala);
    return { escala, personalizada: true, anterior, huboCambio: true };
  }
}

export class RestablecerEscalaDeClasificacion implements RestablecerEscalaDeClasificacionUseCase {
  constructor(private readonly repositorio: EscalaDeClasificacionRepository) {}

  async ejecutar(analistaId: string): Promise<ResultadoCambioDeEscala> {
    const anterior = await escalaVigente(this.repositorio, analistaId);
    if (anterior.personalizada) await this.repositorio.eliminar(analistaId);
    return { escala: EscalaDeClasificacion.CVSS, personalizada: false, anterior, huboCambio: anterior.personalizada };
  }
}
