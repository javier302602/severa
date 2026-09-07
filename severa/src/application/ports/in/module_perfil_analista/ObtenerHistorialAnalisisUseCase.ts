import { AnalisisRealizado } from '../../../../domain/entities/AnalisisRealizado';
import { Paginacion } from '../../out/persistencia/repositorios/VulnerabilidadRepository';

export interface ObtenerHistorialAnalisisUseCase {
  ejecutar(analistaId: string, paginacion?: Paginacion): Promise<AnalisisRealizado[]>;
}
