import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { CalcularResumenEstadisticoUseCase } from '../../ports/in/module_medidas_tendencia_dispersion/CalcularResumenEstadisticoUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import {
  calcularMedia,
  calcularMediana,
  calcularModa,
  calcularCuartiles,
  calcularRango,
  calcularVarianzaMuestral,
  calcularDesviacionEstandarMuestral,
  calcularCoeficienteVariacion,
  calcularMediaGeometrica,
  calcularMediaArmonica
} from '../../../domain/services/descriptive-statistics/EstadisticaDescriptiva';

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
    mediaGeometrica: number | null;
    mediaArmonica: number | null;
  }> {
    const lista = vulnerabilidades ?? await this.vulnerabilidadRepository.listar(analistaId);
    const scores = lista.map((item) => item.cvssScore.valor);
    const { q1, q3 } = calcularCuartiles(scores);
    // RF-50: un CVSS Score de exactamente 0.0 es válido (aunque poco común)
    // — misma guarda que en el pipeline genérico, media geométrica/armónica
    // quedan en null si CUALQUIER score es <= 0.
    const todosPositivos = scores.every((score) => score > 0);

    return {
      media: calcularMedia(scores),
      mediana: calcularMediana(scores),
      moda: calcularModa(scores),
      q1,
      q3,
      rango: calcularRango(scores),
      varianza: calcularVarianzaMuestral(scores),
      desviacionEstandar: calcularDesviacionEstandarMuestral(scores),
      coeficienteVariacion: calcularCoeficienteVariacion(scores),
      mediaGeometrica: todosPositivos ? calcularMediaGeometrica(scores) : null,
      mediaArmonica: todosPositivos ? calcularMediaArmonica(scores) : null
    };
  }
}
