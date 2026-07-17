import request from 'supertest';
import { createApp } from '../../src/infrastructure/config/app';
import { config } from '../../src/infrastructure/config/env';

// RF sin numerar (hueco encontrado al conectar el frontend real, Sprint 15):
// sin CORS, cualquier navegador bloquea las peticiones del SPA antes de que
// lleguen a Express. Se prueba contra /health (pública, sin container) para
// no acoplar esta prueba a ningún caso de uso.
describe('CORS', () => {
  const app = createApp();

  test('responde con Access-Control-Allow-Origin para el origen configurado (CORS_ORIGIN)', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', config.corsOrigin)
      .set('x-forwarded-proto', 'https');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(config.corsOrigin);
  });

  // `cors({ origin: '<string fijo>' })` siempre refleja ESE valor
  // configurado, sin importar qué Origin mande la request — no valida
  // dinámicamente. Eso sigue siendo seguro: la comprobación real la hace el
  // navegador, comparando el Access-Control-Allow-Origin recibido contra SU
  // PROPIO origen, no contra el Origin que mandó. Un sitio malicioso que
  // reciba "Access-Control-Allow-Origin: http://localhost:5173" no puede
  // leer la respuesta igual, porque ese valor no coincide con su propio
  // origen. Este test documenta el comportamiento real, no uno inventado.
  test('el valor de Access-Control-Allow-Origin es siempre el configurado, sin importar el Origin de la request', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://evil.example.com')
      .set('x-forwarded-proto', 'https');

    expect(res.headers['access-control-allow-origin']).toBe(config.corsOrigin);
  });

  test('el preflight OPTIONS responde con los headers CORS esperados', async () => {
    const res = await request(app)
      .options('/auth/login')
      .set('Origin', config.corsOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .set('x-forwarded-proto', 'https');

    expect(res.headers['access-control-allow-origin']).toBe(config.corsOrigin);
  });
});
