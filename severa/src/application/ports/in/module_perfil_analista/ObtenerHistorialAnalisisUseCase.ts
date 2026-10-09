import { AnalisisRealizadoPresentado } from '../../../../domain/services/historial/HistorialDeAnalisis';

export interface PaginaDeHistorialSolicitada {
  limite?: number;
  desplazamiento?: number;
}

export interface PaginaDeHistorialDeAnalisis {
  // Del más reciente al más antiguo.
  eventos: AnalisisRealizadoPresentado[];
  // Total de eventos del analista, no de la página.
  total: number;
  limite: number;
  desplazamiento: number;
}

export interface ObtenerHistorialAnalisisUseCase {
  ejecutar(analistaId: string, pagina?: PaginaDeHistorialSolicitada): Promise<PaginaDeHistorialDeAnalisis>;
}
