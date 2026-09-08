import { AnalisisUnivariadoFecha } from '../descriptive-statistics/AnalisisUnivariadoGenerico';

// Contraparte genérica de InterpretacionDeGraficos.ts (ese archivo está
// tipado contra DatosHistogramaCvss/DatoConteo/ResumenCincoNumeros, todos
// específicos de Vulnerabilidad — acoplarse a él hubiera repetido el error
// de M-04). Este archivo queda como el lugar natural para las
// interpretaciones de RF-51/52/53/56/57 el día que se generalicen de verdad.
export function interpretarHistogramaTiempo(analisis: AnalisisUnivariadoFecha): string {
  if (analisis.distribucion.length === 0) {
    return `No hay valores de "${analisis.nombre}" registrados en este dataset.`;
  }
  const diaConMasFrecuencia = [...analisis.distribucion].sort((a, b) => b.frecuenciaAbsoluta - a.frecuenciaAbsoluta)[0];
  return (
    `El rango va de ${analisis.minimo?.slice(0, 10)} a ${analisis.maximo?.slice(0, 10)} — ` +
    `el día con más registros es ${diaConMasFrecuencia.valor} (${diaConMasFrecuencia.frecuenciaAbsoluta} caso(s)).`
  );
}
