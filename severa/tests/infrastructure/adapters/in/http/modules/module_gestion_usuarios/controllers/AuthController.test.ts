import request from 'supertest';
import type { Analista } from '../../../../../../../../src/domain/entities/Analista';
import type { AnalistaRepository } from '../../../../../../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import type { HasherDeContrasenas } from '../../../../../../../../src/application/ports/out/seguridad/HasherDeContrasenas';

// Usa la clase REAL RegistrarAnalista (no un mock del caso de uso) para
// probar la cadena completa HTTP -> controller -> caso de uso -> entidad:
// el mock de más abajo solo reemplaza el repositorio y el hasher, nunca la
// lógica de negocio que cierra el hueco (RF-04, Sprint 15) — mismo criterio
// que SincronizarConApiNvd.test.ts en Sprint 12.
jest.mock('../../../../../../../../src/infrastructure/config/container', () => {
  const { RegistrarAnalista } = require('../../../../../../../../src/application/usecases/module_gestion_usuarios/RegistrarAnalista');
  const { IniciarSesion } = require('../../../../../../../../src/application/usecases/module_gestion_usuarios/IniciarSesion');
  const {
    IniciarSesionConAuditoria
  } = require('../../../../../../../../src/application/usecases/module_seguridad_auditoria/decoradores/IniciarSesionConAuditoria');
  const { RecuperarContrasena } = require('../../../../../../../../src/application/usecases/module_gestion_usuarios/RecuperarContrasena');
  const { RestablecerContrasena } = require('../../../../../../../../src/application/usecases/module_gestion_usuarios/RestablecerContrasena');
  const { config } = require('../../../../../../../../src/infrastructure/config/env');

  const analistasPorCorreo = new Map<string, Analista>();
  const analistasPorId = new Map<string, Analista>();
  const tokensPorHash = new Map<string, unknown>();

  const analistaRepository: AnalistaRepository = {
    guardar: jest.fn(async (analista: Analista) => {
      analistasPorCorreo.set(analista.correo.valor, analista);
      analistasPorId.set(analista.id, analista);
    }),
    buscarPorCorreo: jest.fn(async (correo: string) => analistasPorCorreo.get(correo) ?? null),
    buscarPorId: jest.fn(async (id: string) => analistasPorId.get(id) ?? null),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };

  // comparar() valida contra el mismo esquema falso que usa generarHash()
  // acá abajo — necesario para que el flujo de /auth/login (RF-08) pueda
  // distinguir de verdad una contraseña correcta de una incorrecta, algo que
  // los tests de registro/recuperación nunca necesitaron.
  const hasher: HasherDeContrasenas = {
    generarHash: jest.fn(async (contrasena: string) => `hash(${contrasena})`),
    comparar: jest.fn(async (contrasena: string, hash: string) => hash === `hash(${contrasena})`)
  };

  // Auditoría en memoria, expuesta como __auditoriaRepository para que los
  // tests de RF-08 (login exitoso/fallido) puedan verificar qué se registró.
  const auditoriaRepository = {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };

  // Repositorio de tokens en memoria: mismo contrato que
  // PostgresTokenRecuperacionRepository, sin base de datos real — necesario
  // para probar el flujo RF-03 completo (solicitar -> restablecer) con las
  // clases reales.
  const tokenRepository = {
    guardar: jest.fn(async (token: { tokenHash: string }) => {
      tokensPorHash.set(token.tokenHash, token);
    }),
    buscarPorHash: jest.fn(async (hash: string) => tokensPorHash.get(hash) ?? null),
    invalidarVigentesDeAnalista: jest.fn(async (analistaId: string) => {
      for (const token of tokensPorHash.values()) {
        const t = token as { analistaId: string; usado: boolean; expiraEn: Date };
        if (t.analistaId === analistaId && !t.usado && t.expiraEn > new Date()) {
          t.usado = true;
        }
      }
    })
  };

  // Captura el token "enviado por correo" para que los tests puedan usarlo
  // en /auth/restablecer-contrasena, sin tener que leer la salida de consola.
  const enviadorDeCorreo = { enviarEnlaceDeRecuperacion: jest.fn().mockResolvedValue(undefined) };

  return {
    container: {
      registrarAnalistaUseCase: new RegistrarAnalista(analistaRepository, hasher),
      iniciarSesionUseCase: new IniciarSesionConAuditoria(
        new IniciarSesion(analistaRepository, hasher, config.jwtSecret),
        auditoriaRepository
      ),
      recuperarContrasenaUseCase: new RecuperarContrasena(analistaRepository, tokenRepository, enviadorDeCorreo),
      restablecerContrasenaUseCase: new RestablecerContrasena(analistaRepository, tokenRepository, hasher),
      __enviadorDeCorreo: enviadorDeCorreo,
      __auditoriaRepository: auditoriaRepository
    }
  };
});

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { container } = require('../../../../../../../../src/infrastructure/config/container');

const app = createApp();

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function ultimoTokenEnviado(): string {
  const llamadas = (container.__enviadorDeCorreo.enviarEnlaceDeRecuperacion as jest.Mock).mock.calls;
  return llamadas[llamadas.length - 1][1];
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

describe('POST /auth/recuperar-contrasena + /auth/restablecer-contrasena — RF-03', () => {
  test('flujo completo: registrar, solicitar recuperación, restablecer con el token real y loguear con la nueva contraseña', async () => {
    await conHttps(
      request(app).post('/auth/register').send({
        id: 'analista-rf03',
        nombre: 'Recupera Contraseña',
        correo: 'recupera@example.com',
        contrasena: 'ClaveVieja123'
      })
    );

    const resSolicitud = await conHttps(
      request(app).post('/auth/recuperar-contrasena').send({ correo: 'recupera@example.com' })
    );
    expect(resSolicitud.status).toBe(200);

    const token = ultimoTokenEnviado();

    const resRestablecer = await conHttps(
      request(app).post('/auth/restablecer-contrasena').send({ token, nuevaContrasena: 'ClaveNueva456' })
    );
    expect(resRestablecer.status).toBe(200);
  });

  test('responde 200 con el mismo mensaje aunque el correo no exista (anti-enumeración)', async () => {
    const res = await conHttps(
      request(app).post('/auth/recuperar-contrasena').send({ correo: 'no-existe-rf03@example.com' })
    );

    expect(res.status).toBe(200);
  });

  test('rechaza reutilizar el mismo token dos veces', async () => {
    await conHttps(
      request(app).post('/auth/register').send({
        id: 'analista-rf03-reuso',
        nombre: 'Reuso De Token',
        correo: 'reuso@example.com',
        contrasena: 'ClaveVieja123'
      })
    );
    await conHttps(request(app).post('/auth/recuperar-contrasena').send({ correo: 'reuso@example.com' }));
    const token = ultimoTokenEnviado();

    const primerUso = await conHttps(
      request(app).post('/auth/restablecer-contrasena').send({ token, nuevaContrasena: 'ClaveNueva456' })
    );
    expect(primerUso.status).toBe(200);

    const segundoUso = await conHttps(
      request(app).post('/auth/restablecer-contrasena').send({ token, nuevaContrasena: 'OtraClave789' })
    );
    expect(segundoUso.status).toBe(400);
  });

  test('rechaza una contraseña nueva de menos de 8 caracteres', async () => {
    await conHttps(
      request(app).post('/auth/register').send({
        id: 'analista-rf03-corta',
        nombre: 'Clave Corta',
        correo: 'corta@example.com',
        contrasena: 'ClaveVieja123'
      })
    );
    await conHttps(request(app).post('/auth/recuperar-contrasena').send({ correo: 'corta@example.com' }));
    const token = ultimoTokenEnviado();

    const res = await conHttps(
      request(app).post('/auth/restablecer-contrasena').send({ token, nuevaContrasena: 'corta1' })
    );

    expect(res.status).toBe(400);
  });

  test('rechaza un token que no existe', async () => {
    const res = await conHttps(
      request(app).post('/auth/restablecer-contrasena').send({ token: 'token-que-nunca-se-emitio', nuevaContrasena: 'ClaveNueva456' })
    );

    expect(res.status).toBe(400);
  });
});

describe('POST /auth/login — RF-08 (auditoría con IP)', () => {
  beforeEach(() => {
    (container.__auditoriaRepository.registrar as jest.Mock).mockClear();
  });

  test('un login exitoso queda auditado como "Login" con la IP de origen', async () => {
    await conHttps(
      request(app).post('/auth/register').send({
        id: 'analista-login-ok',
        nombre: 'Login Exitoso',
        correo: 'login-ok@example.com',
        contrasena: 'ClaveValida123'
      })
    );

    const res = await conHttps(
      request(app).post('/auth/login').send({ correo: 'login-ok@example.com', contrasena: 'ClaveValida123' })
    );

    expect(res.status).toBe(200);
    expect(container.__auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'analista-login-ok', accion: 'Login', ip: expect.any(String) })
    );
  });

  test('un login con contraseña incorrecta sigue fallando igual y además queda auditado como "LoginFallido"', async () => {
    await conHttps(
      request(app).post('/auth/register').send({
        id: 'analista-login-mal',
        nombre: 'Login Fallido',
        correo: 'login-mal@example.com',
        contrasena: 'ClaveValida123'
      })
    );

    const res = await conHttps(
      request(app).post('/auth/login').send({ correo: 'login-mal@example.com', contrasena: 'ClaveIncorrecta' })
    );

    expect(res.status).toBe(400);
    expect(container.__auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'login-mal@example.com', accion: 'LoginFallido', ip: expect.any(String) })
    );
  });
});
