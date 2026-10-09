import {
  GuardarEscalaDeClasificacion,
  ObtenerEscalaDeClasificacion,
  RestablecerEscalaDeClasificacion
} from '../../../src/application/usecases/module_priorizacion_clasificacion/EscalaDeClasificacion';
import {
  GuardarEscalaDeClasificacionConAuditoria,
  RestablecerEscalaDeClasificacionConAuditoria
} from '../../../src/application/usecases/module_seguridad_auditoria/decoradores/EscalaDeClasificacionConAuditoria';
import { AuditoriaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { EscalaDeClasificacionInvalidaError } from '../../../src/domain/errors/EscalaDeClasificacionInvalidaError';
import { EscalaDeClasificacionRepositoryEnMemoria } from '../../dobles/EscalaDeClasificacionRepositoryEnMemoria';

function preparar() {
  const repositorio = new EscalaDeClasificacionRepositoryEnMemoria();
  const auditoria: jest.Mocked<AuditoriaRepository> = { registrar: jest.fn().mockResolvedValue(undefined), listar: jest.fn() };
  return {
    repositorio,
    auditoria,
    obtener: new ObtenerEscalaDeClasificacion(repositorio),
    guardar: new GuardarEscalaDeClasificacionConAuditoria(new GuardarEscalaDeClasificacion(repositorio), auditoria),
    restablecer: new RestablecerEscalaDeClasificacionConAuditoria(new RestablecerEscalaDeClasificacion(repositorio), auditoria)
  };
}

const PROPIA = { moderado: 4.0, alto: 7.0, critico: 8.5 };

describe('Escala de clasificación — RF-28 / RF-69 (Modo B)', () => {
  test('sin configurar, rige la escala CVSS', async () => {
    const { obtener } = preparar();

    const vigente = await obtener.ejecutar('analista-A');

    expect(vigente.personalizada).toBe(false);
    expect(vigente.escala.esCvss).toBe(true);
  });

  test('guardar una escala la deja vigente para ese analista y solo para él', async () => {
    const { obtener, guardar } = preparar();

    const resultado = await guardar.ejecutar('analista-A', PROPIA);

    expect(resultado).toMatchObject({ personalizada: true, huboCambio: true });
    expect((await obtener.ejecutar('analista-A')).escala.clasificar(8.5)).toBe('Crítico');
    expect((await obtener.ejecutar('analista-B')).escala.esCvss).toBe(true);
  });

  test('cambiar la escala se audita con la anterior y la nueva; repetirla igual, no', async () => {
    const { guardar, auditoria } = preparar();

    await guardar.ejecutar('analista-A', PROPIA);
    await guardar.ejecutar('analista-A', PROPIA);

    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    expect(auditoria.registrar).toHaveBeenCalledWith({
      usuario: 'analista-A',
      accion: 'ConfigurarEscalaDeClasificacion',
      detalle: 'Escala CVSS (por defecto) → Escala personalizada: Moderado desde 4.0, Alto desde 7.0, Crítico desde 8.5'
    });
  });

  test('una escala inválida no se guarda ni se audita', async () => {
    const { guardar, repositorio, auditoria } = preparar();

    await expect(guardar.ejecutar('analista-A', { moderado: 7, alto: 4, critico: 9 })).rejects.toThrow(EscalaDeClasificacionInvalidaError);
    expect(repositorio.escalas.size).toBe(0);
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  test('volver a la escala CVSS borra la personalizada y se audita; si ya regía CVSS, no hace nada', async () => {
    const { guardar, restablecer, repositorio, auditoria } = preparar();
    await guardar.ejecutar('analista-A', PROPIA);
    auditoria.registrar.mockClear();

    const resultado = await restablecer.ejecutar('analista-A');
    await restablecer.ejecutar('analista-A');

    expect(resultado).toMatchObject({ personalizada: false, huboCambio: true });
    expect(resultado.escala.esCvss).toBe(true);
    expect(repositorio.escalas.has('analista-A')).toBe(false);
    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    expect(auditoria.registrar.mock.calls[0][0].accion).toBe('RestablecerEscalaDeClasificacion');
  });

  test('guardar los mismos cortes que CVSS equivale a volver a la escala por defecto', async () => {
    const { guardar, repositorio } = preparar();
    await guardar.ejecutar('analista-A', PROPIA);

    const resultado = await guardar.ejecutar('analista-A', { moderado: 4, alto: 7, critico: 9 });

    expect(resultado).toMatchObject({ personalizada: false, huboCambio: true });
    expect(repositorio.escalas.has('analista-A')).toBe(false);
  });
});
