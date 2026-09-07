import { TokenRecuperacion } from '../../../../../domain/entities/TokenRecuperacion';

export interface TokenRecuperacionRepository {
  guardar(token: TokenRecuperacion): Promise<void>;
  buscarPorHash(tokenHash: string): Promise<TokenRecuperacion | null>;
  // RNF-31: nunca debe haber más de un token vigente por analista — se llama
  // antes de emitir uno nuevo, para que un enlace de recuperación anterior
  // (p. ej. de un correo previo que el analista nunca abrió) deje de servir.
  invalidarVigentesDeAnalista(analistaId: string): Promise<void>;
}
