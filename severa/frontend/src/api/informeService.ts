import { httpClient } from './httpClient';

// Contrato verificado contra InformeController.ts. Ninguna de las 3 rutas
// manda Content-Disposition, solo Content-Type — httpClient ya devuelve un
// Blob para cualquier respuesta cuyo content-type no sea json/csv/svg (ver
// leerCuerpoDeRespuesta en httpClient.ts), así que alcanza con tipar la
// promesa como Blob, sin tocar el cliente HTTP.
export type FormatoInforme = 'pdf' | 'docx';
export type FrecuenciaInformePeriodico = 'semanal' | 'mensual';

export const informeService = {
  descargarCompleto: (formato: FormatoInforme): Promise<Blob> => httpClient.get('/informes/completo', { formato }),
  descargarResumenEjecutivo: (): Promise<Blob> => httpClient.get('/informes/resumen-ejecutivo'),
  // RF-83: ya viaja scopeado por analista del lado del backend
  // (req.analistaAutenticado.id, ver InformeController.ts) — el frontend no
  // manda ni necesita mandar ningún identificador de analista acá.
  programar: (frecuencia: FrecuenciaInformePeriodico): Promise<{ mensaje: string }> =>
    httpClient.post('/informes/programar', { frecuencia })
};
