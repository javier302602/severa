import { httpClient } from './httpClient';

// Contrato verificado contra EstadisticaController.ts /
// CalcularResumenEstadistico.ts / GenerarDistribucionFrecuencias.ts.
export interface ResumenEstadistico {
  media: number;
  mediana: number;
  moda: number[];
  q1: number;
  q3: number;
  rango: number;
  varianza: number;
  desviacionEstandar: number;
  coeficienteVariacion: number;
}

export interface FilaFrecuenciaAgrupada {
  intervalo: string;
  limiteInferior: number;
  limiteSuperior: number;
  marcaDeClase: number;
  frecuenciaAbsoluta: number;
  frecuenciaRelativa: number;
  frecuenciaRelativaPorcentaje: number;
  frecuenciaAcumulada: number;
  frecuenciaRelativaAcumulada: number;
}

export interface FilaFrecuenciaSinAgrupar {
  valor: number;
  frecuencia: number;
}

export const estadisticaService = {
  obtenerResumen: (): Promise<ResumenEstadistico> => httpClient.get('/estadistica/resumen'),
  obtenerFrecuenciasAgrupadas: (): Promise<FilaFrecuenciaAgrupada[]> =>
    httpClient.get('/estadistica/frecuencias', { tipo: 'agrupada' }),
  obtenerFrecuenciasSinAgrupar: (): Promise<FilaFrecuenciaSinAgrupar[]> =>
    httpClient.get('/estadistica/frecuencias', { tipo: 'sinAgrupar' })
};
