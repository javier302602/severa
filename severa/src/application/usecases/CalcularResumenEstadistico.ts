import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { CalcularResumenEstadisticoUseCase } from '../ports/in/CalcularResumenEstadisticoUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import {
  calcularMedia,
  calcularMediana,
  calcularModa,
  calcularCuartiles,
  calcularRango,
  calcularVarianzaMuestral,
  calcularDesviacionEstandarMuestral,
  calcularCoeficienteVariacion
} from '../../domain/services/EstadisticaDescriptiva';

export class CalcularResumenEstadistico implements CalcularResumenEstadisticoUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(analistaId: string, vulnerabilidades?: Vulnerabilidad[]): Promise<{
    media: number;
    mediana: number;
    moda: number[];
    q1: number;
    q3: number;
    rango: number;
    varianza: number;
    desviacionEstandar: number;
    coeficienteVariacion: number;
  }> {
    const lista = vulnerabilidades ?? await this.vulnerabilidadRepository.listar(analistaId);
    const scores = lista.map((item) => item.cvssScore.valor);
    const { q1, q3 } = calcularCuartiles(scores);

    return {
      media: calcularMedia(scores),
      mediana: calcularMediana(scores),
      moda: calcularModa(scores),
      q1,
      q3,
      rango: calcularRango(scores),
      varianza: calcularVarianzaMuestral(scores),
      desviacionEstandar: calcularDesviacionEstandarMuestral(scores),
      coeficienteVariacion: calcularCoeficienteVariacion(scores)
    };
  }
}
