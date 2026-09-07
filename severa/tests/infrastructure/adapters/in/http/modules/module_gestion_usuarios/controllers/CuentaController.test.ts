import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Analista } from '../../../../../../../../src/domain/entities/Analista';
import type { AnalistaRepository } from '../../../../../../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import type { AuditoriaRepository } from '../../../../../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';

// Igual que AuthController.test.ts: usa las clases REALES AsignarRol y
// AsignarRolConAuditoria (no un mock del caso de uso), solo se reemplazan los
// repositorios — así se prueba la cadena completa HTTP -> middleware de rol
// -> controller -> caso de uso -> entidad -> auditoría.
jest.mock('../../../../../../../../src/infrastructure/config/container', () => {
  const { AsignarRol } = require('../../../../../../../../src/application/usecases/module_gestion_usuarios/AsignarRol');
  const {
    AsignarRolConAuditoria
  } = require('../../../../../../../../src/application/usecases/module_seguridad_auditoria/decoradores/AsignarRolConAuditoria');
  const { Analista } = require('../../../../../../../../src/domain/entities/Analista');
  const { Correo } = require('../../../../../../../../src/domain/shared/value-objects/Correo');

  const analistasPorId = new Map<string, Analista>([
    ['analista-1', new Analista('analista-1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista')]
  ]);

  const analistaRepository: AnalistaRepository = {
    guardar: jest.fn(async (analista: Analista) => {
      analistasPorId.set(analista.id, analista);
    }),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn(async (id: string) => analistasPorId.get(id) ?? null),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };

  const auditoriaRepository: AuditoriaRepository = {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };

  return {
    container: {
      asignarRolUseCase: new AsignarRolConAuditoria(new AsignarRol(analistaRepository), analistaRepository, auditoriaRepository),
      __auditoriaRepository: auditoriaRepository
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

function conToken(rol: 'analista' | 'administrador', sub = 'quien-ejecuta'): (req: request.Test) => request.Test {
  return (req) => {
    const token = jwt.sign({ sub, rol }, config.jwtSecret, { expiresIn: '1h' });
    return req.set('Authorization', `Bearer ${token}`);
  };
}

describe('PATCH /analistas/:id/rol — RF-04', () => {
  test('un administrador puede asignar un rol válido a otro analista', async () => {
    const conAdmin = conToken('administrador', 'admin-1');

    const res = await conAdmin(
      conHttps(request(app).patch('/analistas/analista-1/rol')).send({ rol: 'administrador' })
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'analista-1', rol: 'administrador' });
    expect(container.__auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'admin-1', accion: 'AsignacionDeRol' })
    );
  });

  test('rechaza un rol que no existe en el dominio', async () => {
    const conAdmin = conToken('administrador', 'admin-1');

    const res = await conAdmin(
      conHttps(request(app).patch('/analistas/analista-1/rol')).send({ rol: 'superadmin' })
    );

    expect(res.status).toBe(400);
  });

  test('un analista sin permisos de administrador no puede asignar roles', async () => {
    const conAnalista = conToken('analista', 'analista-2');

    const res = await conAnalista(
      conHttps(request(app).patch('/analistas/analista-1/rol')).send({ rol: 'administrador' })
    );

    expect(res.status).toBe(403);
  });
});
