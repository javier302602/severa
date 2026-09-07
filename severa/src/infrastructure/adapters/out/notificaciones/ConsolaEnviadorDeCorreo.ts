import { EnviadorDeCorreo } from '../../../../application/ports/out/notificaciones/EnviadorDeCorreo';

// Stub simulado, mismo criterio que ConsolaServicioDeNotificaciones: el envío
// real (SMTP/proveedor externo) queda pendiente de infraestructura, no de
// este RF. El token se imprime en claro porque acá hace de "correo recibido"
// en desarrollo/pruebas — nunca se persiste en claro (ver
// TokenRecuperacion/hashearToken).
export class ConsolaEnviadorDeCorreo implements EnviadorDeCorreo {
  async enviarEnlaceDeRecuperacion(correo: string, token: string): Promise<void> {
    console.log(`[RF-03] Enlace de recuperación para ${correo}: /restablecer-contrasena?token=${token}`);
  }
}
