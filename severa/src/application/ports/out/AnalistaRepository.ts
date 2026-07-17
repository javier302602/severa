import { Analista } from '../../../domain/entities/Analista';

export interface AnalistaRepository {
  guardar(analista: Analista): Promise<void>;
  buscarPorCorreo(correo: string): Promise<Analista | null>;
  buscarPorId(id: string): Promise<Analista | null>;
  eliminar(id: string): Promise<void>;
}
