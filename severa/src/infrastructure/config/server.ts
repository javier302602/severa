import { createApp } from './app';
import { config } from './env';
import { container } from './container';

const app = createApp();

// RF-100 (M-13, retoma): a diferencia de programarInformePeriodicoUseCase
// (opt-in, registrado por el controller cuando un analista lo pide), esta
// tarea es proactiva y global — se registra una sola vez al arrancar,
// reutilizando el mismo ProgramadorDeTareas/NodeCronProgramadorDeTareas de
// RF-83 (ya implementado y conectado, ver container.ts), sin scheduler nuevo.
container.programadorDeTareas.programar('plazos-proximos-a-vencer', '0 8 * * *', () =>
  container.notificarPlazosProximosAVencerUseCase.ejecutar()
);

const servidor = app.listen(config.port, () => {
  console.log(`SIADE running on http://localhost:${config.port}`);
});

// Timeouts generosos (2026-07-17, importación de datasets de cientos de MB
// vía "importar desde link"): con el límite de descarga en 1GB, una
// importación real puede tardar varios minutos (red + streaming + inserción
// por lotes). Los defaults de Node para el timeout de socket/request son
// demasiado cortos para esto.
//
// LIMITACIÓN CONOCIDA, decisión explícita: NO se implementó un modo
// "background" (encolar la importación y consultar el estado después) en
// este cambio — es la solución más correcta a este volumen, pero bastante
// más trabajo (tabla de jobs, endpoint de estado, UI de polling en el
// frontend). Se optó por la alternativa más chica que el pedido ofrecía:
// subir generosamente los timeouts de servidor y aceptar que el cliente
// HTTP (curl, el frontend) tiene que estar dispuesto a esperar varios
// minutos en la misma request. Si el volumen real de uso lo justifica, el
// modo background queda pendiente como mejora futura.
const TIMEOUT_IMPORTACION_MS = 10 * 60 * 1000; // 10 minutos
servidor.timeout = TIMEOUT_IMPORTACION_MS;
servidor.requestTimeout = TIMEOUT_IMPORTACION_MS;
servidor.headersTimeout = TIMEOUT_IMPORTACION_MS + 1000;
