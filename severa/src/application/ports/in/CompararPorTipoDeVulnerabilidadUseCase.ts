import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface CompararPorTipoDeVulnerabilidadUseCase {
  ejecutar(categoriaA: string, categoriaB: string, vulnerabilidades?: Vulnerabilidad[]): Promise<unknown>;
}
