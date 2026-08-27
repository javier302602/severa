import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface CompararPorSoftwareUseCase {
  ejecutar(categoriaA: string, categoriaB: string, analistaId: string, vulnerabilidades?: Vulnerabilidad[]): Promise<unknown>;
}
