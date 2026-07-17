// Debe ser el primer import del archivo: parchea Express antes de que
// cualquier router (importado más abajo) registre sus rutas — ver
// src/types/express-async-errors.d.ts y el error-handler global al final de
// createApp().
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { config } from './env';
import { authRouter } from '../adapters/in/http/AuthController';
import { perfilRouter } from '../adapters/in/http/PerfilController';
import { vulnerabilidadRouter } from '../adapters/in/http/VulnerabilidadController';
import { estadisticaRouter } from '../adapters/in/http/EstadisticaController';
import { graficoRouter } from '../adapters/in/http/GraficoController';
import { comparacionRouter } from '../adapters/in/http/ComparacionController';
import { priorizacionRouter } from '../adapters/in/http/PriorizacionController';
import { informeRouter } from '../adapters/in/http/InformeController';
import { busquedaRouter } from '../adapters/in/http/BusquedaController';
import { datasetRouter } from '../adapters/in/http/DatasetController';
import { auditoriaRouter } from '../adapters/in/http/AuditoriaController';
import { notificacionRouter } from '../adapters/in/http/NotificacionController';
import { analisisDatasetRouter } from '../adapters/in/http/AnalisisDatasetController';
import { exigirHttps } from '../adapters/in/http/middleware/HttpsMiddleware';
import { autenticacion } from '../adapters/in/http/middleware/AutenticacionMiddleware';

// Separado de server.ts (que solo hace app.listen()) para poder testear las
// rutas con supertest sin abrir un puerto real ni requerir una base de datos
// levantada — las pruebas de autenticación nunca llegan a tocar el pool de
// Postgres porque el middleware corta la request antes.
export function createApp(): express.Express {
  const app = express();

  // Primero que cualquier otra cosa: sin esto, un navegador bloquea el
  // preflight (OPTIONS) antes de que la request llegue a exigirHttps o a
  // cualquier ruta — incluidos los propios errores, que también necesitan
  // llevar el header CORS para que el navegador se los muestre al frontend
  // en vez de reportar un genérico "Failed to fetch". Origen configurable
  // por CORS_ORIGIN (ver env.ts), default al puerto de `vite dev`.
  app.use(cors({ origin: config.corsOrigin }));

  // RF-93: nada se procesa (ni siquiera /health o /auth) si la conexión no
  // es segura fuera de development.
  app.use(exigirHttps(config.nodeEnv));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Únicas rutas públicas por diseño: registrarse y loguearse. Todo lo demás
  // exige un JWT válido a partir de acá (hueco de autenticación reportado en
  // M-11, cerrado en M-12).
  app.use('/auth', authRouter);

  app.use(autenticacion);

  // perfilRouter y busquedaRouter definen sus propias rutas literales
  // (/perfil, /analistas/me, /vulnerabilidades/buscar, /filtros-favoritos) y
  // se montan sin prefijo, igual que priorizacionRouter/informeRouter.
  // busquedaRouter debe montarse ANTES de vulnerabilidadRouter: expone
  // GET /vulnerabilidades/buscar, y vulnerabilidadRouter tiene GET
  // /vulnerabilidades/:cve, que interpretaría "buscar" como un CVE si se
  // resolviera primero.
  app.use(perfilRouter);
  app.use(busquedaRouter);
  app.use(datasetRouter);
  app.use('/vulnerabilidades', vulnerabilidadRouter);
  app.use('/estadistica', estadisticaRouter);
  app.use('/graficos', graficoRouter);
  app.use('/comparacion', comparacionRouter);
  app.use(priorizacionRouter);
  app.use(informeRouter);
  app.use(auditoriaRouter);
  app.use(notificacionRouter);
  // Mejora 4 (Análisis de Datos General) — módulo nuevo y separado del resto
  // de la API, rutas propias bajo /analisis-datos/...
  app.use(analisisDatasetRouter);

  // Red de seguridad global: bug real encontrado en Sprint 15 — varios
  // controllers (EstadisticaController, InformeController, el gráfico
  // histogramaCvssAgrupado) no tenían try/catch propio, y un
  // ValorEstadisticoError sin capturar (p. ej. GET /estadistica/resumen con
  // el catálogo vacío, antes de importar cualquier dataset) CRASHEABA TODO
  // EL PROCESO de Node — no era un 500 aislado, tiraba el backend para todos
  // los usuarios. express-async-errors reenvía cualquier rechazo de un
  // handler async a next(err); este middleware (4 parámetros: Express lo
  // reconoce como error-handler solo por esa firma) lo convierte en una
  // respuesta JSON. Mismo criterio 400 que ya usan BusquedaController/
  // DatasetController/GraficoController/PriorizacionController con sus
  // try/catch puntuales — no se inventa un código de estado distinto acá,
  // se generaliza el que el resto del código ya eligió.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[error-handler]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Error desconocido' });
  });

  return app;
}
