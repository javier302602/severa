import request from 'supertest';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import { AnalisisRealizado } from '../../../../../../../../src/domain/entities/AnalisisRealizado';
import type { HistorialAnalisisRepositoryEnMemoria } from '../../../../../../../dobles/HistorialAnalisisRepositoryEnMemoria';

// Mismo criterio que CuentaController.test.ts: usa las clases REALES
// ObtenerHistorialAnalisis/ExportarHistorialAnalisis/EditarPerfil (no un mock
// del caso de uso), solo se reemplazan los repositorios — así se prueba la
// cadena completa HTTP -> middleware de autenticación -> controller -> caso
// de uso -> puerto.
jest.mock('../../../../../../../../src/infrastructure/config/container', () => {
  const { ObtenerHistorialAnalisis } = require('../../../../../../../../src/application/usecases/module_perfil_analista/ObtenerHistorialAnalisis');
  const { ExportarHistorialAnalisis } = require('../../../../../../../../src/application/usecases/module_perfil_analista/ExportarHistorialAnalisis');
  const { ExportadorDeTablaExcelJs } = require('../../../../../../../../src/infrastructure/adapters/out/exportacion/ExportadorDeTablaExcelJs');
  const { HistorialAnalisisRepositoryEnMemoria } = require('../../../../../../../dobles/HistorialAnalisisRepositoryEnMemoria');
  const { EditarPerfil } = require('../../../../../../../../src/application/usecases/module_perfil_analista/EditarPerfil');
  const { Analista } = require('../../../../../../../../src/domain/entities/Analista');
  const { Correo } = require('../../../../../../../../src/domain/shared/value-objects/Correo');

  const historialAnalisisRepository = new HistorialAnalisisRepositoryEnMemoria();

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
      exportarHistorialAnalisisUseCase: new ExportarHistorialAnalisis(historialAnalisisRepository, new ExportadorDeTablaExcelJs()),
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

const historial: HistorialAnalisisRepositoryEnMemoria = container.__historialAnalisisRepository;

function sembrar(analistaId: string, tipoEvento: string, payload: Record<string, unknown>, fecha: string): void {
  historial.eventos.push(new AnalisisRealizado(`${analistaId}-${historial.eventos.length}`, analistaId, tipoEvento, payload, new Date(fecha)));
}

describe('GET /perfil/historial — RF-11', () => {
  test('un analista sin eventos registrados recibe un historial vacío', async () => {
    const conAnalista = conToken('analista-sin-historial');

    const res = await conAnalista(conHttps(request(app).get('/perfil/historial')));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eventos: [], total: 0, limite: 50, desplazamiento: 0 });
  });

  test('devuelve los análisis propios con fecha, dataset y tipo, del más reciente al más antiguo', async () => {
    sembrar('analista-con-historial', 'InformeGenerado', { formato: 'pdf' }, '2026-10-01T10:00:00Z');
    sembrar('analista-con-historial', 'MatrizDeCorrelacion', { dataset: 'encuesta.csv', datasetId: 'd-1', version: 2 }, '2026-10-05T10:00:00Z');

    const conAnalista = conToken('analista-con-historial');
    const res = await conAnalista(conHttps(request(app).get('/perfil/historial')));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.eventos).toEqual([
      expect.objectContaining({
        fechaHora: '2026-10-05T10:00:00.000Z',
        tipoEvento: 'MatrizDeCorrelacion',
        tipoDeAnalisis: 'Matriz de correlación',
        origen: 'dataset',
        dataset: 'encuesta.csv',
        datasetId: 'd-1',
        version: 2,
        detalle: null
      }),
      expect.objectContaining({
        fechaHora: '2026-10-01T10:00:00.000Z',
        tipoDeAnalisis: 'Informe completo',
        origen: 'catalogo',
        dataset: 'Catálogo de vulnerabilidades',
        datasetId: null,
        detalle: 'Formato PDF'
      })
    ]);
  });

  test('pagina con ?limite y ?desplazamiento', async () => {
    for (let dia = 1; dia <= 5; dia += 1) sembrar('analista-paginado', 'Graficos', {}, `2026-09-0${dia}T10:00:00Z`);
    const conAnalista = conToken('analista-paginado');

    const res = await conAnalista(conHttps(request(app).get('/perfil/historial?limite=2&desplazamiento=2')));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 5, limite: 2, desplazamiento: 2 });
    expect(res.body.eventos.map((evento: { fechaHora: string }) => evento.fechaHora.slice(0, 10))).toEqual(['2026-09-03', '2026-09-02']);
  });

  test.each(['limite=0', 'limite=abc', 'limite=-1', 'desplazamiento=1.5', 'limite=10&desplazamiento=x'])(
    'rechaza un paginado inválido (%s) con 400',
    async (query) => {
      const res = await conToken('analista-paginado')(conHttps(request(app).get(`/perfil/historial?${query}`)));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/limite/);
    }
  );

  test('scoping: un analista no ve el historial de otro', async () => {
    sembrar('analista-dueno', 'InformeGenerado', { formato: 'docx' }, '2026-10-01T10:00:00Z');

    const conOtroAnalista = conToken('analista-intruso');
    const res = await conOtroAnalista(conHttps(request(app).get('/perfil/historial')));

    expect(res.status).toBe(200);
    expect(res.body.eventos).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('rechaza la petición sin token de autenticación', async () => {
    const res = await conHttps(request(app).get('/perfil/historial'));

    expect(res.status).toBe(401);
  });
});

describe('GET /perfil/historial/exportar — RF-14', () => {
  function comoBuffer(req: request.Test): request.Test {
    return req.buffer(true).parse((respuesta, callback) => {
      const partes: Buffer[] = [];
      respuesta.on('data', (parte: Buffer) => partes.push(parte));
      respuesta.on('end', () => callback(null, Buffer.concat(partes)));
    });
  }

  test('descarga el historial propio como .xlsx con fecha, dataset y tipo de análisis', async () => {
    sembrar('analista-exporta', 'AnalisisUnivariado', { dataset: 'ventas.xlsx', datasetId: 'd-9', version: 1 }, '2026-10-02T12:00:00Z');
    sembrar('analista-ajeno', 'Graficos', {}, '2026-10-03T12:00:00Z');

    const res = await comoBuffer(conToken('analista-exporta')(conHttps(request(app).get('/perfil/historial/exportar'))));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toBe('attachment; filename="historial-de-analisis.xlsx"');

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(res.body);
    const filas: unknown[][] = [];
    libro.worksheets[0].eachRow((fila) => filas.push((fila.values as unknown[]).slice(1)));
    expect(filas).toEqual([
      ['Fecha (America/Lima)', 'Dataset', 'Versión', 'Tipo de análisis', 'Detalle'],
      [new Date('2026-10-02T07:00:00Z'), 'ventas.xlsx', 'versión 1', 'Análisis univariado']
    ]);
  });

  test('rechaza la petición sin token de autenticación', async () => {
    const res = await conHttps(request(app).get('/perfil/historial/exportar'));

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
