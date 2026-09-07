import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Analista } from '../../../../../../../../src/domain/entities/Analista';
import type { AnalistaRepository } from '../../../../../../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import type { AuditoriaRepository } from '../../../../../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';

// Igual que AuthController.test.ts: usa las clases REALES AsignarRol,
// AsignarRolConAuditoria, EliminarCuenta y EliminarCuentaConAuditoria (no un
// mock del caso de uso), solo se reemplazan los repositorios/hasher — así se
// prueba la cadena completa HTTP -> middleware de rol/autenticación ->
// controller -> caso de uso -> entidad -> auditoría.
jest.mock('../../../../../../../../src/infrastructure/config/container', () => {
  const { AsignarRol } = require('../../../../../../../../src/application/usecases/module_gestion_usuarios/AsignarRol');
  const {
    AsignarRolConAuditoria
  } = require('../../../../../../../../src/application/usecases/module_seguridad_auditoria/decoradores/AsignarRolConAuditoria');
  const { EliminarCuenta } = require('../../../../../../../../src/application/usecases/module_gestion_usuarios/EliminarCuenta');
  const {
    EliminarCuentaConAuditoria
  } = require('../../../../../../../../src/application/usecases/module_seguridad_auditoria/decoradores/EliminarCuentaConAuditoria');
  const { Analista } = require('../../../../../../../../src/domain/entities/Analista');
  const { Correo } = require('../../../../../../../../src/domain/shared/value-objects/Correo');

  // Ids dedicados para los tests de RF-15 (distintos de 'analista-1', que ya
  // usan los tests de RF-04 más abajo) — así un borrado exitoso en un test no
  // afecta a los demás sin importar el orden de ejecución.
  const analistasPorId = new Map<string, Analista>([
    ['analista-1', new Analista('analista-1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista')],
    ['cuenta-a-eliminar', new Analista('cuenta-a-eliminar', 'Carla', new Correo('carla@example.com'), 'hash-real', 'analista')],
    ['cuenta-clave-incorrecta', new Analista('cuenta-clave-incorrecta', 'Beto', new Correo('beto@example.com'), 'hash-real', 'analista')]
  ]);

  const analistaRepository: AnalistaRepository = {
    guardar: jest.fn(async (analista: Analista) => {
      analistasPorId.set(analista.id, analista);
    }),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn(async (id: string) => analistasPorId.get(id) ?? null),
    eliminar: jest.fn(async (id: string) => {
      analistasPorId.delete(id);
    })
  };

  const auditoriaRepository: AuditoriaRepository = {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };

  // Fake simple (no bcrypt real): "ClaveCorrecta123" es la única contraseña
  // que hace match, sin importar el hash guardado — alcanza para probar el
  // contrato del puerto sin acoplarse a BcryptHasher.
  const hasher = {
    generarHash: jest.fn().mockResolvedValue('hash'),
    comparar: jest.fn(async (contrasena: string) => contrasena === 'ClaveCorrecta123')
  };

  return {
    container: {
      asignarRolUseCase: new AsignarRolConAuditoria(new AsignarRol(analistaRepository), analistaRepository, auditoriaRepository),
      eliminarCuentaUseCase: new EliminarCuentaConAuditoria(
        new EliminarCuenta(analistaRepository, hasher),
        analistaRepository,
        auditoriaRepository
      ),
      __auditoriaRepository: auditoriaRepository,
      __analistaRepository: analistaRepository
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

describe('DELETE /analistas/me — RF-15', () => {
  test('elimina la cuenta con la contraseña correcta y queda auditado', async () => {
    const conAnalista = conToken('analista', 'cuenta-a-eliminar');

    const res = await conAnalista(
      conHttps(request(app).delete('/analistas/me')).send({ contrasena: 'ClaveCorrecta123' })
    );

    expect(res.status).toBe(204);
    expect(container.__auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'cuenta-a-eliminar', accion: 'EliminacionDeCuenta' })
    );
    expect(await container.__analistaRepository.buscarPorId('cuenta-a-eliminar')).toBeNull();
  });

  test('rechaza con 401 y NO borra la cuenta si la contraseña es incorrecta', async () => {
    const conAnalista = conToken('analista', 'cuenta-clave-incorrecta');

    const res = await conAnalista(
      conHttps(request(app).delete('/analistas/me')).send({ contrasena: 'ClaveIncorrecta' })
    );

    expect(res.status).toBe(401);
    expect(await container.__analistaRepository.buscarPorId('cuenta-clave-incorrecta')).not.toBeNull();
    // Scopeado a este actor concreto: __auditoriaRepository.registrar es un
    // único jest.fn() compartido por todo el archivo (el mock del container
    // se crea una sola vez), así que ya acumula la llamada del test anterior
    // (borrado exitoso de 'cuenta-a-eliminar') — un simple "no llamado con
    // accion: EliminacionDeCuenta" daría falso negativo por esa llamada ajena.
    expect(container.__auditoriaRepository.registrar).not.toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'cuenta-clave-incorrecta', accion: 'EliminacionDeCuenta' })
    );
  });

  test('rechaza con 400 si no se envía contraseña en el body', async () => {
    const conAnalista = conToken('analista', 'cuenta-clave-incorrecta');

    const res = await conAnalista(conHttps(request(app).delete('/analistas/me')).send({}));

    expect(res.status).toBe(400);
    expect(await container.__analistaRepository.buscarPorId('cuenta-clave-incorrecta')).not.toBeNull();
  });
});
