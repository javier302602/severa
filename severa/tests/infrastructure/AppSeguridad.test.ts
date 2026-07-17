import request from 'supertest';
import jwt from 'jsonwebtoken';

const FAVORITOS: Record<string, unknown[]> = {
  'analista-A': [{ id: 'fav-a', analistaId: 'analista-A', nombre: 'Solo de A', criterios: {}, fechaCreacion: new Date() }],
  'analista-B': [{ id: 'fav-b', analistaId: 'analista-B', nombre: 'Solo de B', criterios: {}, fechaCreacion: new Date() }]
};

const NOTIFICACIONES: Record<string, unknown[]> = {
  'analista-A': [{ id: 'notif-a', tipo: 'VulnerabilidadCritica', destinatario: 'analista-A', leida: false, fecha: new Date(), mensaje: 'Solo de A' }],
  'analista-B': [{ id: 'notif-b', tipo: 'VulnerabilidadCritica', destinatario: 'analista-B', leida: false, fecha: new Date(), mensaje: 'Solo de B' }]
};

const ANALISTAS: Record<string, { id: string; nombre: string; correo: { valor: string }; rol: string }> = {
  'analista-A': { id: 'analista-A', nombre: 'Ana', correo: { valor: 'ana@example.com' }, rol: 'analista' },
  'analista-B': { id: 'analista-B', nombre: 'Beto', correo: { valor: 'beto@example.com' }, rol: 'analista' }
};

// Se mockea el container completo: estas pruebas son de la capa HTTP
// (middlewares + controllers), no de los casos de uso reales — así no hace
// falta una Postgres real levantada para probar autenticación/autorización.
jest.mock('../../src/infrastructure/config/container', () => ({
  container: {
    iniciarSesionUseCase: {
      ejecutar: jest.fn(async () => ({
        token: 'token-de-prueba',
        analista: { id: 'analista-A', nombre: 'Ana', correo: { valor: 'ana@example.com' }, rol: 'analista' }
      }))
    },
    listarFiltrosFavoritosUseCase: {
      ejecutar: jest.fn(async (analistaId: string) => FAVORITOS[analistaId] ?? [])
    },
    guardarFiltroFavoritoUseCase: {
      ejecutar: jest.fn(async (input: { analistaId: string; nombre: string; criterios: unknown }) => ({
        id: 'nuevo-id',
        ...input
      }))
    },
    editarPerfilUseCase: {
      ejecutar: jest.fn(async (input: { id: string; nombre: string; correo: string }) => ({
        id: input.id,
        nombre: input.nombre,
        correo: { valor: input.correo },
        rol: 'analista'
      }))
    },
    verPerfilUseCase: {
      ejecutar: jest.fn(async (id: string) => ANALISTAS[id])
    },
    obtenerNotificacionesUseCase: {
      ejecutar: jest.fn(async (analistaId: string) => NOTIFICACIONES[analistaId] ?? [])
    },
    marcarNotificacionLeidaUseCase: {
      // Simula el scoping por dueño de PostgresNotificacionRepository.marcarComoLeida:
      // solo devuelve true si el id pertenece al analista que lo pide.
      ejecutar: jest.fn(async (id: string, analistaId: string) => {
        const propias = NOTIFICACIONES[analistaId] as Array<{ id: string }> | undefined;
        return (propias ?? []).some((n) => n.id === id);
      })
    }
  }
}));

import { createApp } from '../../src/infrastructure/config/app';
import { config } from '../../src/infrastructure/config/env';

const app = createApp();

function tokenPara(id: string, rol: 'analista' | 'administrador' = 'analista'): string {
  return jwt.sign({ sub: id, rol }, config.jwtSecret, { expiresIn: '1h' });
}

// NODE_ENV='test' durante los tests (lo fija Jest), y HttpsMiddleware solo
// exime 'development' — se simula el mismo header que usaría un proxy/balanceador
// real en producción para no debilitar el middleware.
function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

describe('Seguridad HTTP de la aplicación (M-12)', () => {
  test('GET /health no requiere autenticación', async () => {
    const res = await conHttps(request(app).get('/health'));
    expect(res.status).toBe(200);
  });

  test('POST /auth/login no requiere token (es pública) aunque el resto de la API sí lo exija', async () => {
    const res = await conHttps(
      request(app).post('/auth/login').send({ correo: 'ana@example.com', contrasena: 'cualquier-cosa' })
    );

    // Si `autenticacion` interceptara /auth, esto sería 401 con
    // "Token de autenticación requerido" en vez de llegar al controller.
    expect(res.status).toBe(200);
    expect(res.body.token).toBe('token-de-prueba');
  });

  const rutasProtegidas: Array<['get' | 'post' | 'put' | 'delete' | 'patch', string]> = [
    ['get', '/vulnerabilidades/buscar?cve=CVE-2021-44228'],
    ['get', '/vulnerabilidades/buscar/exportar?cve=CVE-2021-44228'],
    ['get', '/filtros-favoritos'],
    ['post', '/filtros-favoritos'],
    ['get', '/perfil'],
    ['put', '/perfil'],
    ['delete', '/analistas/me'],
    ['get', '/vulnerabilidades/CVE-2021-44228'],
    ['get', '/estadistica/resumen'],
    ['get', '/graficos/histogramaCvss'],
    ['get', '/comparacion/acceso'],
    ['get', '/priorizacion/ranking'],
    ['get', '/informes/completo?formato=pdf'],
    ['get', '/auditoria'],
    ['get', '/notificaciones'],
    ['patch', '/notificaciones/notif-a/leida'],
    ['post', '/dataset/importar'],
    ['get', '/dataset/exportar'],
    ['post', '/dataset/importar-url'],
    ['post', '/informes/programar']
  ];

  test.each(rutasProtegidas)('%s %s devuelve 401 sin token', async (metodo, ruta) => {
    const res = await conHttps(request(app)[metodo](ruta));
    expect(res.status).toBe(401);
  });

  test('devuelve 401 con un token inválido/manipulado', async () => {
    const res = await conHttps(
      request(app).get('/filtros-favoritos').set('Authorization', 'Bearer esto-no-es-un-jwt-valido')
    );
    expect(res.status).toBe(401);
  });

  test('devuelve 401 con un token firmado con otro secreto', async () => {
    const tokenAjeno = jwt.sign({ sub: 'analista-A', rol: 'analista' }, 'otro-secreto-distinto');
    const res = await conHttps(
      request(app).get('/filtros-favoritos').set('Authorization', `Bearer ${tokenAjeno}`)
    );
    expect(res.status).toBe(401);
  });

  test('un analista solo ve SUS propios filtros favoritos, sin importar qué analistaId venga en la query', async () => {
    const tokenA = tokenPara('analista-A');
    const res = await conHttps(
      request(app).get('/filtros-favoritos?analistaId=analista-B').set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].analistaId).toBe('analista-A');
  });

  test('GET /perfil devuelve los datos del dueño del token, sin importar qué id venga en la query', async () => {
    const tokenA = tokenPara('analista-A');
    const res = await conHttps(
      request(app).get('/perfil?id=analista-B').set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('analista-A');
    expect(res.body.correo).toBe('ana@example.com');
  });

  test('GET /perfil con el token de otro analista devuelve SUS propios datos, no los del primero', async () => {
    const tokenB = tokenPara('analista-B');
    const res = await conHttps(request(app).get('/perfil').set('Authorization', `Bearer ${tokenB}`));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('analista-B');
    expect(res.body.correo).toBe('beto@example.com');
  });

  test('PUT /perfil edita el perfil del dueño del token, ignorando cualquier id que venga en el body', async () => {
    const tokenA = tokenPara('analista-A');
    const res = await conHttps(
      request(app)
        .put('/perfil')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ id: 'analista-B', nombre: 'Nuevo Nombre', correo: 'nuevo@example.com' })
    );

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('analista-A');
  });

  test('GET /auditoria exige rol administrador (403 para un analista autenticado)', async () => {
    const tokenAnalista = tokenPara('analista-A', 'analista');
    const res = await conHttps(request(app).get('/auditoria').set('Authorization', `Bearer ${tokenAnalista}`));
    expect(res.status).toBe(403);
  });

  test('GET /notificaciones solo devuelve las notificaciones del dueño del token', async () => {
    const tokenA = tokenPara('analista-A');
    const res = await conHttps(request(app).get('/notificaciones').set('Authorization', `Bearer ${tokenA}`));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('notif-a');
  });

  test('PATCH /notificaciones/:id/leida en una notificación de OTRO analista devuelve 404, no la marca como leída', async () => {
    const tokenA = tokenPara('analista-A');
    const res = await conHttps(
      request(app).patch('/notificaciones/notif-b/leida').set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(404);
  });

  test('PATCH /notificaciones/:id/leida en la propia notificación devuelve 204', async () => {
    const tokenA = tokenPara('analista-A');
    const res = await conHttps(
      request(app).patch('/notificaciones/notif-a/leida').set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(204);
  });
});
