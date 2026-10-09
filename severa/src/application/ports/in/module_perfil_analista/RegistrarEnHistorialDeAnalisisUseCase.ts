import { TipoDeAnalisisDeDataset, TipoDeAnalisisDelCatalogo } from '../../../../domain/services/historial/HistorialDeAnalisis';

export interface OpcionesDeRegistroEnHistorial {
  // Texto corto que acompaña al tipo de análisis ("Formato PDF", "Versión 2").
  detalle?: string;
  // true: se anota cada vez que ocurre (generar un informe, limpiar). Por
  // defecto se anota una sola vez por sesión de análisis (dataset) o por día
  // (catálogo), para que consultar varias veces lo mismo no llene el historial.
  cadaVez?: boolean;
}

// RF-11: anota en el historial del analista un análisis que acaba de hacer.
// Es un registro accesorio: NUNCA lanza. Si no se puede anotar (base caída,
// sesión que expiró entre medio), el análisis que el analista pidió igual se
// entrega; el fallo queda en el log del servidor.
export interface RegistrarEnHistorialDeAnalisisUseCase {
  deSesion(analistaId: string, sesionId: string, tipo: TipoDeAnalisisDeDataset, opciones?: OpcionesDeRegistroEnHistorial): Promise<void>;
  delCatalogo(analistaId: string, tipo: TipoDeAnalisisDelCatalogo, opciones?: OpcionesDeRegistroEnHistorial): Promise<void>;
}
