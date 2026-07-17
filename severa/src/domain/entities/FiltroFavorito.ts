import { CriteriosFiltroVulnerabilidad } from '../value-objects/FiltroVulnerabilidad';

// RF-89: combinación de filtros guardada y nombrada por un analista para
// reutilizarla. `criterios` se guarda como el DTO plano (serializable a JSON),
// no como el value object FiltroVulnerabilidad, porque este último puede
// contener instancias (IdentificadorCVE) que no tiene sentido persistir tal cual.
export class FiltroFavorito {
  constructor(
    public readonly id: string,
    public readonly analistaId: string,
    public readonly nombre: string,
    public readonly criterios: CriteriosFiltroVulnerabilidad,
    public readonly fechaCreacion: Date = new Date()
  ) {}
}
