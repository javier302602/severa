import { CvssScore } from './CvssScore';
import { EscalaDeClasificacion } from './EscalaDeClasificacion';

export type NivelDeRiesgo = 'Bajo' | 'Moderado' | 'Alto' | 'Crítico';

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
  //
  // RF-28/RF-69 (Modo B): los cortes salen de una EscalaDeClasificacion —
  // la del analista, o la de CVSS si no configuró ninguna.
  static desde(cvssScore: CvssScore, escala: EscalaDeClasificacion = EscalaDeClasificacion.CVSS): NivelDeRiesgoValue {
    return new NivelDeRiesgoValue(escala.clasificar(cvssScore.valor));
  }
}
