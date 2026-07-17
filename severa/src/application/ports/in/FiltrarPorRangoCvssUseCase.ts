import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface FiltrarPorRangoCvssUseCase {
  ejecutar(cvssMin: number, cvssMax: number): Promise<Vulnerabilidad[]>;
}
