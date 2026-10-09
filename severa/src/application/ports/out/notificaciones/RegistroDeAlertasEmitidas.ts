import { TipoDeAlertaDePlazo } from '../../../../domain/services/notificaciones/AlertasDePlazo';

// La memoria de qué alertas de plazo ya se emitieron, para no repetirlas cada
// vez que se vuelve a evaluar la misma condición (ver migración 017).
export interface RegistroDeAlertasEmitidas {
  // Anota como emitidas las que todavía no lo estaban y devuelve SOLO esas.
  // Es una sola operación atómica: si dos procesos evalúan lo mismo a la vez
  // (dos pestañas pidiendo el ranking), cada vulnerabilidad le toca a uno
  // solo. Los ids que no corresponden a una vulnerabilidad guardada del
  // analista se ignoran (no vuelven en el resultado).
  registrarNuevas(analistaId: string, tipo: TipoDeAlertaDePlazo, vulnerabilidadIds: string[]): Promise<string[]>;

  // Deshace un registrarNuevas cuya notificación no se pudo emitir, para que
  // el próximo intento vuelva a encontrarlas como nuevas.
  olvidar(analistaId: string, tipo: TipoDeAlertaDePlazo, vulnerabilidadIds: string[]): Promise<void>;
}
