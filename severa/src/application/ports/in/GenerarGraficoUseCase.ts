import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

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
  ejecutar(
    tipo: TipoGrafico,
    analistaId: string,
    opciones?: { limite?: number; formato?: 'svg' | 'json' | 'png' | 'pdf' },
    vulnerabilidades?: Vulnerabilidad[]
  ): Promise<unknown>;
}
