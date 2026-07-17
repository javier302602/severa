import { MarcarEnProcesoDeRemediacionConAuditoria } from '../../../src/application/usecases/auditoria/MarcarEnProcesoDeRemediacionConAuditoria';
import { MarcarEnProcesoDeRemediacionUseCase } from '../../../src/application/ports/in/MarcarEnProcesoDeRemediacionUseCase';
import { AuditoriaRepository } from '../../../src/application/ports/out/AuditoriaRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/value-objects/TipoAcceso';
import { EstadoRemediacionValue } from '../../../src/domain/value-objects/EstadoRemediacion';

function auditoriaFalsa(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

describe('MarcarEnProcesoDeRemediacionConAuditoria', () => {
  test('registra quién hizo el cambio de estado cuando la actualización tiene éxito', async () => {
    const actualizada = new Vulnerabilidad(
      '1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j',
      new TipoAccesoValue('Sí'), undefined, undefined, undefined, new EstadoRemediacionValue('EnProceso')
    );
    const usecase: MarcarEnProcesoDeRemediacionUseCase = { ejecutar: jest.fn().mockResolvedValue(actualizada) };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new MarcarEnProcesoDeRemediacionConAuditoria(usecase, auditoriaRepository);

    const resultado = await decorator.ejecutar('CVE-2021-44228', 'analista-9');

    expect(resultado).toBe(actualizada);
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'analista-9', accion: 'CambioEstadoRemediacion' })
    );
  });

  test('NO registra nada si la vulnerabilidad no existe (usecase devuelve null)', async () => {
    const usecase: MarcarEnProcesoDeRemediacionUseCase = { ejecutar: jest.fn().mockResolvedValue(null) };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new MarcarEnProcesoDeRemediacionConAuditoria(usecase, auditoriaRepository);

    const resultado = await decorator.ejecutar('CVE-9999-99999', 'analista-9');

    expect(resultado).toBeNull();
    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
  });
});
