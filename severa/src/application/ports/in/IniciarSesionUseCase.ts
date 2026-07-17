import { Analista } from '../../../domain/entities/Analista';

export interface IniciarSesionUseCase {
  ejecutar(input: { correo: string; contrasena: string }): Promise<{ analista: Analista; token: string }>;
}
