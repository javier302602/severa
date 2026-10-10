import { FiltrarPorCategoriaClasificacion } from '../../../src/application/usecases/module_priorizacion_clasificacion/FiltrarPorCategoriaClasificacion';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { EscalaDeClasificacion } from '../../../src/domain/shared/value-objects/EscalaDeClasificacion';
import { VariableDeConsultaInvalidaError } from '../../../src/domain/errors/VariableDeConsultaInvalidaError';
import { EscalaDeClasificacionRepositoryEnMemoria } from '../../dobles/EscalaDeClasificacionRepositoryEnMemoria';

function repositorioFalso(resultados: Vulnerabilidad[]): jest.Mocked<VulnerabilidadRepository> {
  return {
    guardar: jest.fn(),
    guardarLote: jest.fn(),
    contar: jest.fn(),
    listar: jest.fn(),
    buscarPorCve: jest.fn(),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorNivelDeRiesgo: jest.fn().mockResolvedValue(resultados),
    filtrarPorRango: jest.fn(),
    filtrarPorCategoria: jest.fn().mockResolvedValue(resultados),
    listarPorTipoAcceso: jest.fn(),
    listarPorTipoVulnerabilidad: jest.fn(),
    listarPorSoftware: jest.fn(),
    listarSoftwareDisponible: jest.fn(),
    actualizarEstado: jest.fn(),
    buscarConFiltros: jest.fn(),
    eliminarTodas: jest.fn()
  };
}

function preparar(resultados: Vulnerabilidad[] = []) {
  const repository = repositorioFalso(resultados);
  const escalas = new EscalaDeClasificacionRepositoryEnMemoria();
  return { repository, escalas, usecase: new FiltrarPorCategoriaClasificacion(repository, escalas) };
}

// M-04 (retoma, RF-28) + RF-28/RF-69 (Modo B): el nivel de riesgo se filtra
// por el rango de CVSS que le da la escala del analista, nunca contra la
// columna `severidad`.
describe('FiltrarPorCategoriaClasificacion', () => {
  test('sin variable explícita filtra por nivel de riesgo, con el rango de la escala CVSS (retrocompatibilidad)', async () => {
    const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.5), 'Apache Log4j');
    const { repository, usecase } = preparar([vulnerabilidad]);

    const resultado = await usecase.ejecutar('Crítico', 'analista-A');

    expect(repository.filtrarPorNivelDeRiesgo).toHaveBeenCalledWith({ nivel: 'Crítico', minimo: 9, menorQue: null }, 'analista-A');
    expect(repository.filtrarPorCategoria).not.toHaveBeenCalled();
    expect(resultado.vulnerabilidades).toEqual([{ vulnerabilidad, nivelDeRiesgo: 'Crítico' }]);
    expect(resultado.escala.personalizada).toBe(false);
  });

  test('RF-28: "el filtro por categoría refleja los umbrales configurados"', async () => {
    const { repository, escalas, usecase } = preparar();
    await escalas.guardar('analista-A', EscalaDeClasificacion.personalizada({ moderado: 3.5, alto: 6, critico: 8.5 }));

    await usecase.ejecutar('Alto', 'analista-A');

    expect(repository.filtrarPorNivelDeRiesgo).toHaveBeenCalledWith({ nivel: 'Alto', minimo: 6, menorQue: 8.5 }, 'analista-A');
  });

  test('los nombres viejos se siguen aceptando: "Media" es Moderado', async () => {
    const { repository, usecase } = preparar();

    await usecase.ejecutar('Media', 'analista-A', 'severidad');

    expect(repository.filtrarPorNivelDeRiesgo).toHaveBeenCalledWith({ nivel: 'Moderado', minimo: 4, menorQue: 7 }, 'analista-A');
  });

  test('un texto que no es un nivel de riesgo se rechaza con un mensaje claro', async () => {
    const { repository, usecase } = preparar();

    await expect(usecase.ejecutar('Urgente', 'analista-A')).rejects.toThrow(VariableDeConsultaInvalidaError);
    expect(repository.filtrarPorNivelDeRiesgo).not.toHaveBeenCalled();
  });

  test('con variable="tipoAcceso" explícita, delega en filtrarPorCategoria con esa variable', async () => {
    const { repository, usecase } = preparar();

    await usecase.ejecutar('Remoto', 'analista-A', 'tipoAcceso');

    expect(repository.filtrarPorCategoria).toHaveBeenCalledWith('tipoAcceso', 'Remoto', 'analista-A');
  });

  test('con variable="estadoRemediacion" explícita, delega en filtrarPorCategoria con esa variable', async () => {
    const { repository, usecase } = preparar();

    await usecase.ejecutar('Pendiente', 'analista-A', 'estadoRemediacion');

    expect(repository.filtrarPorCategoria).toHaveBeenCalledWith('estadoRemediacion', 'Pendiente', 'analista-A');
  });

  test('devuelve una lista vacía si no hay coincidencias', async () => {
    const { usecase } = preparar([]);

    const resultado = await usecase.ejecutar('Bajo', 'analista-A');

    expect(resultado.vulnerabilidades).toEqual([]);
  });
});
