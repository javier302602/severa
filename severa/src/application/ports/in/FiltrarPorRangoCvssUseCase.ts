import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface FiltrarPorRangoCvssUseCase {
  ejecutar(cvssMin: number, cvssMax: number, analistaId: string): Promise<Vulnerabilidad[]>;
}
