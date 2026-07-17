import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface CompararPorSoftwareUseCase {
  ejecutar(categoriaA: string, categoriaB: string, vulnerabilidades?: Vulnerabilidad[]): Promise<unknown>;
}
