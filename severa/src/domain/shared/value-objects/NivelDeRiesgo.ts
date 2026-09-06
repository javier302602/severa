import { CvssScore } from './CvssScore';

export type NivelDeRiesgo = 'Bajo' | 'Moderado' | 'Alto' | 'Crítico';

const UMBRALES: Array<{ minimo: number; nivel: NivelDeRiesgo }> = [
  { minimo: 9.0, nivel: 'Crítico' },
  { minimo: 7.0, nivel: 'Alto' },
  { minimo: 4.0, nivel: 'Moderado' },
  { minimo: 0.0, nivel: 'Bajo' }
];

export class NivelDeRiesgoValue {
  public readonly valor: NivelDeRiesgo;

  private constructor(valor: NivelDeRiesgo) {
    this.valor = valor;
  }

  // Solo se construye a partir de un CvssScore ya validado (0.0-10.0), nunca
  // de un string libre. La escala oficial CVSS v3.1 define un 5to nivel
  // "None" para 0.0, pero el SDS (RF-69, línea 4029) fija el enum en 4
  // valores (Bajo, Moderado, Alto, Crítico); por decisión confirmada con el
  // product owner, un CVSS de 0.0 se clasifica como "Bajo".
  static desde(cvssScore: CvssScore): NivelDeRiesgoValue {
    const umbral = UMBRALES.find((item) => cvssScore.valor >= item.minimo);
    return new NivelDeRiesgoValue((umbral as { nivel: NivelDeRiesgo }).nivel);
  }
}
