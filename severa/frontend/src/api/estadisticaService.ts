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

// RF-33: variables numéricas del catálogo sobre las que el backend sabe armar
// una distribución (ver VariablesVulnerabilidad.ts). El orden es el del
// selector; la primera es la que el backend usa si no se manda ninguna.
export const VARIABLES_DE_FRECUENCIAS = [
  { valor: 'cvssScore', etiqueta: 'CVSS Score' },
  { valor: 'diasParaParche', etiqueta: 'Días para parche' }
] as const;

export type VariableDeFrecuencias = (typeof VARIABLES_DE_FRECUENCIAS)[number]['valor'];

// RF-39: mismos límites que valida el backend (NUMERO_MINIMO_DE_INTERVALOS /
// NUMERO_MAXIMO_DE_INTERVALOS en DistribucionFrecuencias.ts). Acá solo sirven
// para avisar antes de pedir; quien decide sigue siendo el backend.
export const NUMERO_MINIMO_DE_INTERVALOS = 2;
export const NUMERO_MAXIMO_DE_INTERVALOS = 30;

export interface ConsultaDeFrecuencias {
  variable: VariableDeFrecuencias;
  // undefined = que el sistema elija (las 5 bandas de CVSS, o Sturges para
  // el resto). Solo aplica a la tabla agrupada.
  numeroDeIntervalos?: number;
}

function parametros(tipo: 'agrupada' | 'sinAgrupar', consulta: ConsultaDeFrecuencias): Record<string, string | number | undefined> {
  return {
    tipo,
    variable: consulta.variable,
    numeroDeIntervalos: tipo === 'agrupada' ? consulta.numeroDeIntervalos : undefined
  };
}

export const estadisticaService = {
  obtenerResumen: (): Promise<ResumenEstadistico> => httpClient.get('/estadistica/resumen'),
  obtenerFrecuenciasAgrupadas: (consulta: ConsultaDeFrecuencias): Promise<FilaFrecuenciaAgrupada[]> =>
    httpClient.get('/estadistica/frecuencias', parametros('agrupada', consulta)),
  obtenerFrecuenciasSinAgrupar: (consulta: ConsultaDeFrecuencias): Promise<FilaFrecuenciaSinAgrupar[]> =>
    httpClient.get('/estadistica/frecuencias', parametros('sinAgrupar', consulta)),
  // RF-38: la misma tabla que se ve en pantalla (mismos parámetros), en .xlsx.
  exportarFrecuencias: (tipo: 'agrupada' | 'sinAgrupar', consulta: ConsultaDeFrecuencias): Promise<Blob> =>
    httpClient.get('/estadistica/frecuencias/exportar', parametros(tipo, consulta))
};
