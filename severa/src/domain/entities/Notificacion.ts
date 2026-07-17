export type TipoNotificacion = 'VulnerabilidadCritica' | 'PlazoVencido' | 'InformeListo' | 'ActualizacionNVD';

// RF-99 a RF-104: modela la clase Notificacion del SDS (M-13). El campo
// `mensaje` es una extensión sobre el modelo mínimo del SDS
// (idNotificacion/tipo/destinatario/leida/fecha) — mismo motivo que `detalle`
// en RegistroAuditoria (Sprint 12): sin texto, el centro de notificaciones
// solo podría mostrar un tipo y una fecha, sin decir qué CVE o qué informe
// disparó la alerta.
export class Notificacion {
  constructor(
    public readonly id: string,
    public readonly tipo: TipoNotificacion,
    public readonly destinatario: string,
    public readonly leida: boolean = false,
    public readonly fecha: Date = new Date(),
    public readonly mensaje: string = ''
  ) {}
}
