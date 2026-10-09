import { httpClient } from './httpClient';

// Contrato verificado contra AuditoriaController.ts. GET /auditoria está
// protegido por requiereRol('administrador') del lado del backend — un
// analista sin ese rol recibe 403 con { error: 'No tiene permisos...' } si
// llega a esta pantalla igual (ej. tipeando la URL a mano); httpClient ya
// convierte eso en un HttpError genérico que MensajeError puede mostrar sin
// tratamiento especial.
export interface RegistroAuditoria {
  id: string;
  usuario: string;
  accion: string;
  detalle: string;
  fechaHora: string;
  // RF-138: el dataset genérico sobre el que se hizo la operación, si la
  // operación fue sobre uno (carga, limpieza, imputación, exportación…).
  // Es siempre el id del dataset ORIGINAL de la familia.
  datasetId?: string | null;
}

export const auditoriaService = {
  // Con datasetId, solo la auditoría de ese dataset (sirve el id del
  // original o el de cualquiera de sus versiones).
  listar: (datasetId?: string): Promise<RegistroAuditoria[]> => httpClient.get('/auditoria', datasetId ? { datasetId } : undefined)
};
