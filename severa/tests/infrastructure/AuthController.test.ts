import request from 'supertest';
import type { Analista } from '../../src/domain/entities/Analista';
import type { AnalistaRepository } from '../../src/application/ports/out/AnalistaRepository';
import type { HasherDeContrasenas } from '../../src/application/ports/out/HasherDeContrasenas';

// Usa la clase REAL RegistrarAnalista (no un mock del caso de uso) para
// probar la cadena completa HTTP -> controller -> caso de uso -> entidad:
// el mock de más abajo solo reemplaza el repositorio y el hasher, nunca la
// lógica de negocio que cierra el hueco (RF-04, Sprint 15) — mismo criterio
// que SincronizarConApiNvd.test.ts en Sprint 12.
jest.mock('../../src/infrastructure/config/container', () => {
  const { RegistrarAnalista } = require('../../src/application/usecases/RegistrarAnalista');

  const analistasPorCorreo = new Map<string, Analista>();

  const analistaRepository: AnalistaRepository = {
    guardar: jest.fn(async (analista: Analista) => {
      analistasPorCorreo.set(analista.correo.valor, analista);
    }),
    buscarPorCorreo: jest.fn(async (correo: string) => analistasPorCorreo.get(correo) ?? null),
    buscarPorId: jest.fn().mockResolvedValue(null),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };

  const hasher: HasherDeContrasenas = {
    generarHash: jest.fn(async (contrasena: string) => `hash(${contrasena})`),
    comparar: jest.fn().mockResolvedValue(true)
  };

  return {
    container: {
      registrarAnalistaUseCase: new RegistrarAnalista(analistaRepository, hasher),
      iniciarSesionUseCase: { ejecutar: jest.fn() }
    }
  };
});

import { createApp } from '../../src/infrastructure/config/app';

const app = createApp();

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

describe('POST /auth/register — RF-04 (Sprint 15)', () => {
  test('un body con rol "administrador" NO logra crear un administrador: el analista queda con rol "analista"', async () => {
    const res = await conHttps(
      request(app).post('/auth/register').send({
        id: 'analista-intruso',
        nombre: 'Intento de Escalada',
        correo: 'intruso@example.com',
        contrasena: 'ClaveSegura123',
        rol: 'administrador'
      })
    );

    expect(res.status).toBe(201);
    expect(res.body.rol).toBe('analista');
  });

  test('un registro normal (sin mandar rol) también queda como "analista"', async () => {
    const res = await conHttps(
      request(app).post('/auth/register').send({
        id: 'analista-normal',
        nombre: 'Registro Normal',
        correo: 'normal@example.com',
        contrasena: 'ClaveSegura123'
      })
    );

    expect(res.status).toBe(201);
    expect(res.body.rol).toBe('analista');
  });
});
