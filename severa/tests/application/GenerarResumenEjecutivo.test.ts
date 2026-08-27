import { GenerarResumenEjecutivo } from '../../src/application/usecases/GenerarResumenEjecutivo';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { AuditoriaRepository } from '../../src/application/ports/out/AuditoriaRepository';
import { AnalistaRepository } from '../../src/application/ports/out/AnalistaRepository';
import { Analista } from '../../src/domain/entities/Analista';
import { Correo } from '../../src/domain/value-objects/Correo';
import { GeneradorDeInformes, DatosInforme } from '../../src/application/ports/out/GeneradorDeInformes';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

function repoFalso(vulnerabilidades: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue(vulnerabilidades),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue([]),
    eliminarTodas: jest.fn().mockResolvedValue(0)
  };
}

function auditoriaRepositoryFalso(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

function analistaRepositoryFalso(): AnalistaRepository {
  const analista = new Analista('analista-A', 'Ana Torres', new Correo('ana@example.com'), 'hash', 'analista');
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn().mockResolvedValue(analista),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };
}

const dataset = [
  new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí')),
  new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No')),
  new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí')),
  new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(5.5), 'Nginx', new TipoAccesoValue('No'))
];

describe('GenerarResumenEjecutivo', () => {
  test('arma los datos y llama únicamente a generarResumenEjecutivo', async () => {
    let datosRecibidos: DatosInforme | undefined;
    const geradorDeInformes: GeneradorDeInformes = {
      generarInformeCompleto: jest.fn().mockResolvedValue(Buffer.from('')),
      generarInformeWord: jest.fn().mockResolvedValue(Buffer.from('')),
      generarResumenEjecutivo: jest.fn(async (datos: DatosInforme) => { datosRecibidos = datos; return Buffer.from('resumen-falso'); }),
      generarInformeDataset: jest.fn().mockResolvedValue(Buffer.from('')),
      generarInformeDatasetWord: jest.fn().mockResolvedValue(Buffer.from(''))
    };

    const usecase = new GenerarResumenEjecutivo(repoFalso(dataset), geradorDeInformes, auditoriaRepositoryFalso(), analistaRepositoryFalso());
    const resultado = await usecase.ejecutar('analista-A');

    expect(resultado.toString()).toBe('resumen-falso');
    expect(geradorDeInformes.generarResumenEjecutivo).toHaveBeenCalledTimes(1);
    expect(geradorDeInformes.generarInformeCompleto).not.toHaveBeenCalled();
    expect(geradorDeInformes.generarInformeWord).not.toHaveBeenCalled();
    expect(datosRecibidos?.totalVulnerabilidades).toBe(4);
    expect(datosRecibidos?.interpretacion).toHaveLength(4);
    expect(datosRecibidos?.generadoPara).toBe('Ana Torres');
  });
});
