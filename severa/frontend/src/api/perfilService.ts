import { httpClient } from './httpClient';
import type { Analista } from '../types/Analista';

export interface DatosEdicionPerfil {
  nombre: string;
  correo: string;
}

// Contratos verificados contra PerfilController.ts: GET /perfil (RF-09) y
// PUT /perfil (RF-10) — ambos toman el id exclusivamente de
// req.analistaAutenticado.id, nunca de un parámetro que este servicio pueda
// mandar.
export const perfilService = {
  obtener: (): Promise<Analista> => httpClient.get('/perfil'),
  editar: (datos: DatosEdicionPerfil): Promise<Analista> => httpClient.put('/perfil', datos)
};
