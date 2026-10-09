import { httpClient } from './httpClient';

import { parametrosDeInforme, type OpcionesDescargaDeInforme } from './formatosDeInforme';

// Contrato verificado contra InformeController.ts. httpClient ya devuelve un
// Blob para cualquier respuesta cuyo content-type no sea json/csv/svg (ver
// leerCuerpoDeRespuesta en httpClient.ts), así que alcanza con tipar la
// promesa como Blob. El backend manda Content-Disposition, pero el nombre de
// archivo lo decide el frontend (ver nombreDeArchivoDeInforme): esa cabecera
// no es legible desde otro origen sin exponerla por CORS.
export type FrecuenciaInformePeriodico = 'semanal' | 'mensual';

export const informeService = {
  descargarCompleto: (opciones: OpcionesDescargaDeInforme): Promise<Blob> => httpClient.get('/informes/completo', parametrosDeInforme(opciones)),
  descargarResumenEjecutivo: (): Promise<Blob> => httpClient.get('/informes/resumen-ejecutivo'),
  // RF-83: ya viaja scopeado por analista del lado del backend
  // (req.analistaAutenticado.id, ver InformeController.ts) — el frontend no
  // manda ni necesita mandar ningún identificador de analista acá.
  programar: (frecuencia: FrecuenciaInformePeriodico): Promise<{ mensaje: string }> =>
    httpClient.post('/informes/programar', { frecuencia })
};
