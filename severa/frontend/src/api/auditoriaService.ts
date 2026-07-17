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
}

export const auditoriaService = {
  listar: (): Promise<RegistroAuditoria[]> => httpClient.get('/auditoria')
};
