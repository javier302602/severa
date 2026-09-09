import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';

export type TipoGrafico =
  | 'histogramaCvss'
  | 'histogramaCvssAgrupado'
  | 'barrasSeveridad'
  | 'pastelSeveridad'
  | 'boxplotCvss'
  | 'dispersionCvssDias'
  | 'cvssPorAcceso'
  | 'histogramaDiasParche'
  | 'topSoftware'
  | 'topTipos';

export interface GenerarGraficoUseCase {
  // M-07 (retoma, RF-51/52/53/56/57): `variable` es un único campo genérico
  // (string crudo, sin validar en el controller) — cada `case` del switch en
  // GenerarGrafico.ts sabe si espera una VariableNumericaVulnerabilidad o
  // una VariableCategoricaVulnerabilidad y valida/castea ahí (decisión
  // confirmada: el controller no necesita conocer esa taxonomía). Para
  // 'cvssPorAcceso' específicamente, el SDS separa dos variables
  // independientes (RF-56 agrupación, RF-57 valor) — `variableAgrupacion`/
  // `variableValor` cubren ese caso aparte. Ninguno de los tres rompe
  // llamadas existentes: todos opcionales, con default retrocompatible
  // resuelto dentro de cada case.
  ejecutar(
    tipo: TipoGrafico,
    analistaId: string,
    opciones?: {
      limite?: number;
      formato?: 'svg' | 'json' | 'png' | 'pdf';
      variable?: string;
      variableAgrupacion?: string;
      variableValor?: string;
    },
    vulnerabilidades?: Vulnerabilidad[]
  ): Promise<unknown>;
}
