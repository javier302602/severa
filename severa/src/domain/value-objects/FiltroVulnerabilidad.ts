import { IdentificadorCVE } from './IdentificadorCVE';
import { CvssScore } from './CvssScore';
import { EstadoRemediacion } from './EstadoRemediacion';
import { FiltroVacioError } from '../errors/FiltroVacioError';

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
  estadoRemediacion?: EstadoRemediacion;
}

// RF-88: agrupa todos los criterios combinables de búsqueda. Todos son
// opcionales individualmente, pero al menos uno debe estar presente (si no,
// FiltroVacioError). cve y cvssMin/cvssMax reutilizan la validación ya
// existente de IdentificadorCVE (RF-84) y CvssScore en vez de duplicarla.
export class FiltroVulnerabilidad {
  public readonly cve?: IdentificadorCVE;
  public readonly cvssMin?: number;
  public readonly cvssMax?: number;
  public readonly severidad?: string;
  public readonly fechaDesde?: Date;
  public readonly fechaHasta?: Date;
  public readonly componente?: string;
  public readonly estadoRemediacion?: EstadoRemediacion;

  constructor(criterios: CriteriosFiltroVulnerabilidad) {
    const { cve, cvssMin, cvssMax, severidad, fechaDesde, fechaHasta, componente, estadoRemediacion } = criterios;

    const algunoPresente = [cve, cvssMin, cvssMax, severidad, fechaDesde, fechaHasta, componente, estadoRemediacion].some(
      (valor) => valor !== undefined && valor !== null && valor !== ''
    );

    if (!algunoPresente) {
      throw new FiltroVacioError();
    }

    this.cve = cve !== undefined ? new IdentificadorCVE(cve) : undefined;
    this.cvssMin = cvssMin !== undefined ? new CvssScore(cvssMin).valor : undefined;
    this.cvssMax = cvssMax !== undefined ? new CvssScore(cvssMax).valor : undefined;
    this.severidad = severidad;
    this.fechaDesde = fechaDesde;
    this.fechaHasta = fechaHasta;
    this.componente = componente;
    this.estadoRemediacion = estadoRemediacion;
  }
}
