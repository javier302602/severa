import { IdentificadorCVE } from './IdentificadorCVE';
import { CvssScore } from './CvssScore';
import { EstadoRemediacion } from './EstadoRemediacion';
import { FiltroVacioError } from '../../errors/FiltroVacioError';
import { VariableDeConsultaInvalidaError } from '../../errors/VariableDeConsultaInvalidaError';
import { NivelDeRiesgo } from './NivelDeRiesgo';
import { nivelDeRiesgoDesdeTexto } from './EscalaDeClasificacion';
import {
  VariableCategoricaAbiertaVulnerabilidad,
  esVariableCategoricaAbiertaValida
} from '../../services/inferential-statistics/ComparacionPorCategoriasGenerico';

// DTO plano (serializable a JSON) usado tanto para construir el value object
// como para persistir los criterios de un filtro favorito (RF-89).
export interface CriteriosFiltroVulnerabilidad {
  cve?: string;
  cvssMin?: number;
  cvssMax?: number;
  severidad?: string;
  // RF-85 pide filtrar por "fecha de publicación", pero SEVERA no tiene esa
  // fecha: SincronizarConApiNvd/NvdApiClientHttp nunca capturan el
  // publishedDate de la API NVD. fechaDesde/fechaHasta se aplican contra
  // fechaCarga (cuándo SEVERA importó el registro), no contra la divulgación
  // real del CVE. Misma limitación conocida que estaPlazoExcedido() en
  // MotorDePriorizacion.ts (ver LIMITACIÓN CONOCIDA ahí) — si en el futuro el
  // dataset incorpora la fecha real de NVD, este filtro debería usar esa
  // fecha en vez de fechaCarga.
  fechaDesde?: Date;
  fechaHasta?: Date;
  componente?: string;
  // RF-86 (M-11, retoma): contra qué variable categórica ABIERTA (M-08:
  // tipoVulnerabilidad | software — texto libre, sin lista fija; distinta
  // de VariableCategoricaVulnerabilidad de M-04/M-07, que es un conjunto
  // cerrado y ya tiene sus propios campos dedicados: severidad/estadoRemediacion
  // arriba) se compara `componente`. Opcional a propósito: los favoritos
  // guardados antes de esta retoma no la traen — ver resolverVariableComponente,
  // default 'software' (comportamiento de siempre, sin este campo).
  variableComponente?: string;
  estadoRemediacion?: EstadoRemediacion;
}

// Solo se resuelve/valida cuando `componente` está presente — variableComponente
// sin componente no tiene nada que interpretar, así que un valor inválido ahí
// se ignora en vez de romper un filtro que ni siquiera lo necesita (decisión
// confirmada al planear la retoma).
function resolverVariableComponente(valor: string | undefined): VariableCategoricaAbiertaVulnerabilidad {
  if (valor === undefined) return 'software';
  if (!esVariableCategoricaAbiertaValida(valor)) {
    throw new VariableDeConsultaInvalidaError(`"${valor}" no es una variable de componente válida (tipoVulnerabilidad, software)`);
  }
  return valor;
}

// RF-88: agrupa todos los criterios combinables de búsqueda. Todos son
// opcionales individualmente, pero al menos uno debe estar presente (si no,
// FiltroVacioError). cve y cvssMin/cvssMax reutilizan la validación ya
// existente de IdentificadorCVE (RF-84) y CvssScore en vez de duplicarla.
function nivelDeRiesgoValido(texto: string): NivelDeRiesgo {
  const nivel = nivelDeRiesgoDesdeTexto(texto);
  if (!nivel) {
    throw new VariableDeConsultaInvalidaError(`"${texto}" no es un nivel de riesgo: usá Bajo, Moderado, Alto o Crítico`);
  }
  return nivel;
}

// Los criterios con el nivel de riesgo escrito con su nombre unificado: un
// favorito guardado con "Alta" se muestra y se vuelve a guardar como "Alto".
// Un texto que no nombra ningún nivel se deja como está (al usarlo,
// FiltroVulnerabilidad lo rechaza con un mensaje claro).
export function normalizarCriterios(criterios: CriteriosFiltroVulnerabilidad): CriteriosFiltroVulnerabilidad {
  if (typeof criterios.severidad !== 'string' || criterios.severidad === '') return criterios;
  const nivel = nivelDeRiesgoDesdeTexto(criterios.severidad);
  return nivel ? { ...criterios, severidad: nivel } : criterios;
}

export class FiltroVulnerabilidad {
  public readonly cve?: IdentificadorCVE;
  public readonly cvssMin?: number;
  public readonly cvssMax?: number;
  // RF-28 / RF-69 (Modo B): el nivel de riesgo pedido, ya con el nombre
  // unificado. El criterio sigue llegando como `severidad` (así lo mandan las
  // URLs y lo tienen guardado los favoritos) y se aceptan los nombres viejos
  // (Baja, Media, Alta, Crítica). Qué rango de CVSS le corresponde lo decide
  // la escala del analista al consultar, no este objeto.
  public readonly nivelDeRiesgo?: NivelDeRiesgo;
  public readonly fechaDesde?: Date;
  public readonly fechaHasta?: Date;
  public readonly componente?: string;
  // Siempre resuelta (nunca queda como el string crudo sin validar) cuando
  // `componente` está presente — 'software' por defecto si no se especifica,
  // idéntico al comportamiento de antes de RF-86 (M-11, retoma).
  public readonly variableComponente?: VariableCategoricaAbiertaVulnerabilidad;
  public readonly estadoRemediacion?: EstadoRemediacion;

  constructor(criterios: CriteriosFiltroVulnerabilidad) {
    const { cve, cvssMin, cvssMax, severidad, fechaDesde, fechaHasta, componente, variableComponente, estadoRemediacion } = criterios;

    // variableComponente NO cuenta como criterio independiente — es un
    // modificador de componente, no un filtro en sí mismo (mismo motivo por
    // el que no dispara FiltroVacioError si viniera solo).
    const algunoPresente = [cve, cvssMin, cvssMax, severidad, fechaDesde, fechaHasta, componente, estadoRemediacion].some(
      (valor) => valor !== undefined && valor !== null && valor !== ''
    );

    if (!algunoPresente) {
      throw new FiltroVacioError();
    }

    this.cve = cve !== undefined ? new IdentificadorCVE(cve) : undefined;
    this.cvssMin = cvssMin !== undefined ? new CvssScore(cvssMin).valor : undefined;
    this.cvssMax = cvssMax !== undefined ? new CvssScore(cvssMax).valor : undefined;
    this.nivelDeRiesgo = severidad !== undefined && severidad !== '' ? nivelDeRiesgoValido(severidad) : undefined;
    this.fechaDesde = fechaDesde;
    this.fechaHasta = fechaHasta;
    this.componente = componente;
    this.variableComponente = componente !== undefined ? resolverVariableComponente(variableComponente) : undefined;
    this.estadoRemediacion = estadoRemediacion;
  }
}
