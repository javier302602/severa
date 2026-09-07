// RF-03: puerto mínimo y deliberadamente separado de ServicioDeNotificaciones
// — ese puerto está atado a analistas autenticados con centro de
// notificaciones in-app; alguien recuperando su contraseña no puede
// loguearse para verlo. Mismo criterio de "adaptador simulado" que el resto
// del repo: no hay infraestructura SMTP real todavía.
export interface EnviadorDeCorreo {
  enviarEnlaceDeRecuperacion(correo: string, token: string): Promise<void>;
}
