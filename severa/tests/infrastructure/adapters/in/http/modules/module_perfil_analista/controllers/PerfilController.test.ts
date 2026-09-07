import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { AnalisisRealizado } from '../../../../../../../../src/domain/entities/AnalisisRealizado';
import type { HistorialAnalisisRepository } from '../../../../../../../../src/application/ports/out/persistencia/repositorios/HistorialAnalisisRepository';

// Mismo criterio que CuentaController.test.ts: usa las clases REALES
// ObtenerHistorialAnalisis/RegistrarAnalisisRealizado/EditarPerfil (no un mock
// del caso de uso), solo se reemplazan los repositorios — así se prueba la
// cadena completa HTTP -> middleware de autenticación -> controller -> caso
// de uso -> puerto.
jest.mock('../../../../../../../../src/infrastructure/config/container', () => {
  const { ObtenerHistorialAnalisis } = require('../../../../../../../../src/application/usecases/module_perfil_analista/ObtenerHistorialAnalisis');
  const { RegistrarAnalisisRealizado } = require('../../../../../../../../src/application/usecases/module_perfil_analista/RegistrarAnalisisRealizado');
  const { EditarPerfil } = require('../../../../../../../../src/application/usecases/module_perfil_analista/EditarPerfil');
  const { Analista } = require('../../../../../../../../src/domain/entities/Analista');
  const { Correo } = require('../../../../../../../../src/domain/shared/value-objects/Correo');

  const registros: AnalisisRealizado[] = [];
  const historialAnalisisRepository: HistorialAnalisisRepository = {
    registrar: jest.fn(async (analisis: AnalisisRealizado) => {
      registros.push(analisis);
    }),
    listarPorAnalista: jest.fn(async (analistaId: string, paginacion) => {
      const propios = registros
        .filter((registro) => registro.analistaId === analistaId)
        .sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime());
      if (!paginacion) return propios;
      return propios.slice(paginacion.offset, paginacion.offset + paginacion.limite);
    })
  };

  // Sembrado para RF-10 (PUT /perfil): un id distinto por escenario, para que
  // los tests no dependan del orden de ejecución ni se contaminen entre sí.
  const analistasPorId = new Map([
    ['nombre-ok', new Analista('nombre-ok', 'Nombre Viejo', new Correo('nombre-ok@example.com'), 'hash', 'analista')],
    ['correo-libre', new Analista('correo-libre', 'Ana', new Correo('correo-libre@example.com'), 'hash', 'analista')],
    ['correo-duplicado-dueno', new Analista('correo-duplicado-dueno', 'Dueño', new Correo('dueno@example.com'), 'hash', 'analista')],
    ['correo-duplicado-otro', new Analista('correo-duplicado-otro', 'Otro', new Correo('otro@example.com'), 'hash', 'analista')],
    ['correo-sin-cambiar', new Analista('correo-sin-cambiar', 'Sin Cambiar', new Correo('sin-cambiar@example.com'), 'hash', 'analista')]
  ]);
  const analistaRepository = {
    guardar: jest.fn(async (analista: InstanceType<typeof Analista>) => {
      analistasPorId.set(analista.id, analista);
    }),
    buscarPorCorreo: jest.fn(async (correo: string) => {
      for (const analista of analistasPorId.values()) {
        if (analista.correo.valor === correo) return analista;
      }
      return null;
    }),
    buscarPorId: jest.fn(async (id: string) => analistasPorId.get(id) ?? null),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };

  return {
    container: {
      obtenerHistorialAnalisisUseCase: new ObtenerHistorialAnalisis(historialAnalisisRepository),
      registrarAnalisisRealizadoUseCase: new RegistrarAnalisisRealizado(historialAnalisisRepository),
      editarPerfilUseCase: new EditarPerfil(analistaRepository),
      __historialAnalisisRepository: historialAnalisisRepository
    }
  };
});

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { container } = require('../../../../../../../../src/infrastructure/config/container');

const app = createApp();

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function conToken(sub: string): (req: request.Test) => request.Test {
  return (req) => {
    const token = jwt.sign({ sub, rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
    return req.set('Authorization', `Bearer ${token}`);
  };
}

describe('GET /perfil/historial — RF-11', () => {
  test('un analista sin eventos registrados recibe un historial vacío', async () => {
    const conAnalista = conToken('analista-sin-historial');

    const res = await conAnalista(conHttps(request(app).get('/perfil/historial')));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('devuelve los eventos propios del analista, más reciente primero', async () => {
    await container.registrarAnalisisRealizadoUseCase.ejecutar({
      analistaId: 'analista-con-historial',
      tipoEvento: 'InformeGenerado',
      payload: { formato: 'pdf' }
    });

    const conAnalista = conToken('analista-con-historial');
    const res = await conAnalista(conHttps(request(app).get('/perfil/historial')));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ tipoEvento: 'InformeGenerado', payload: { formato: 'pdf' } });
  });

  test('scoping: un analista no ve el historial de otro', async () => {
    await container.registrarAnalisisRealizadoUseCase.ejecutar({
      analistaId: 'analista-dueno',
      tipoEvento: 'InformeGenerado',
      payload: { formato: 'docx' }
    });

    const conOtroAnalista = conToken('analista-intruso');
    const res = await conOtroAnalista(conHttps(request(app).get('/perfil/historial')));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('rechaza la petición sin token de autenticación', async () => {
    const res = await conHttps(request(app).get('/perfil/historial'));

    expect(res.status).toBe(401);
  });
});

describe('PUT /perfil — RF-10', () => {
  test('edita el nombre exitosamente', async () => {
    const conAnalista = conToken('nombre-ok');

    const res = await conAnalista(
      conHttps(request(app).put('/perfil')).send({ nombre: 'Nombre Nuevo', correo: 'nombre-ok@example.com' })
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'nombre-ok', nombre: 'Nombre Nuevo', correo: 'nombre-ok@example.com' });
  });

  test('edita el correo a uno libre exitosamente', async () => {
    const conAnalista = conToken('correo-libre');

    const res = await conAnalista(
      conHttps(request(app).put('/perfil')).send({ nombre: 'Ana', correo: 'correo-libre-nuevo@example.com' })
    );

    expect(res.status).toBe(200);
    expect(res.body.correo).toBe('correo-libre-nuevo@example.com');
  });

  test('rechaza el cambio de correo si ya está registrado por OTRO analista', async () => {
    const conAnalista = conToken('correo-duplicado-dueno');

    const res = await conAnalista(
      conHttps(request(app).put('/perfil')).send({ nombre: 'Dueño', correo: 'otro@example.com' })
    );

    expect(res.status).toBe(400);
  });

  test('no rechaza cuando el analista reenvía su propio correo sin cambiarlo', async () => {
    const conAnalista = conToken('correo-sin-cambiar');

    const res = await conAnalista(
      conHttps(request(app).put('/perfil')).send({ nombre: 'Sin Cambiar Editado', correo: 'sin-cambiar@example.com' })
    );

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Sin Cambiar Editado');
  });
});
