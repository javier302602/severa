import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { TipoDeAlertaDePlazo, convieneResumirAlertas } from '../../../domain/services/notificaciones/AlertasDePlazo';
import { RegistroDeAlertasEmitidas } from '../../ports/out/notificaciones/RegistroDeAlertasEmitidas';
import { ServicioDeNotificaciones } from '../../ports/out/notificaciones/ServicioDeNotificaciones';

// Emite las alertas de plazo (RF-76 y RF-100) de un analista sin repetirlas.
//
// Quien lo llama le pasa TODAS las vulnerabilidades que hoy cumplen la
// condición (están vencidas, o por vencer). Este servicio:
//   1. deja pasar solo las que todavía no tenían esa alerta emitida;
//   2. si son pocas, avisa de cada una; si son muchas, emite un único resumen.
// Así, volver a evaluar la misma condición —otra visita al ranking, la
// corrida del día siguiente— no genera ninguna notificación nueva.
//
// Lo comparten GenerarRankingUrgencia (RF-76) y NotificarPlazosProximosAVencer
// (RF-100), que antes notificaban cada uno por su cuenta, una notificación
// por vulnerabilidad y por evaluación.
export class EmisorDeAlertasDePlazo {
  constructor(
    private readonly registroDeAlertasEmitidas: RegistroDeAlertasEmitidas,
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones
  ) {}

  // Devuelve cuántas vulnerabilidades se alertaron por primera vez.
  async emitir(analistaId: string, tipo: TipoDeAlertaDePlazo, vulnerabilidades: Vulnerabilidad[]): Promise<number> {
    if (vulnerabilidades.length === 0) return 0;

    const idsNuevos = await this.registroDeAlertasEmitidas.registrarNuevas(
      analistaId,
      tipo,
      vulnerabilidades.map((vulnerabilidad) => vulnerabilidad.id)
    );
    if (idsNuevos.length === 0) return 0;

    const nuevos = new Set(idsNuevos);
    const nuevas = vulnerabilidades.filter((vulnerabilidad) => nuevos.has(vulnerabilidad.id));

    try {
      if (convieneResumirAlertas(nuevas.length)) {
        await this.servicioDeNotificaciones.notificarResumenDeAlertasDePlazo(analistaId, tipo, nuevas);
      } else {
        for (const vulnerabilidad of nuevas) {
          if (tipo === 'PlazoVencido') {
            await this.servicioDeNotificaciones.notificarPlazoExcedido(vulnerabilidad, analistaId);
          } else {
            await this.servicioDeNotificaciones.notificarPlazoProximoAVencer(vulnerabilidad, analistaId);
          }
        }
      }
    } catch (error) {
      // No se pudo avisar: se las "olvida" para que el próximo intento las
      // vuelva a encontrar como nuevas. Si alguna de las individuales sí
      // llegó a guardarse puede repetirse una vez; es preferible a que una
      // alerta se pierda para siempre.
      await this.registroDeAlertasEmitidas.olvidar(analistaId, tipo, idsNuevos);
      throw error;
    }

    return nuevas.length;
  }
}
