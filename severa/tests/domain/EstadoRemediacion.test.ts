import { EstadoRemediacionValue } from '../../src/domain/value-objects/EstadoRemediacion';
import { TransicionDeEstadoInvalidaError } from '../../src/domain/errors/TransicionDeEstadoInvalidaError';

describe('EstadoRemediacionValue', () => {
  test('por defecto inicia en Pendiente', () => {
    expect(new EstadoRemediacionValue().valor).toBe('Pendiente');
  });

  test('transición válida: Pendiente -> EnProceso', () => {
    const resultado = new EstadoRemediacionValue('Pendiente').transicionarA('EnProceso');
    expect(resultado.valor).toBe('EnProceso');
  });

  test('transición válida: EnProceso -> Remediada', () => {
    const resultado = new EstadoRemediacionValue('EnProceso').transicionarA('Remediada');
    expect(resultado.valor).toBe('Remediada');
  });

  test('transición inválida: Pendiente -> Remediada directo (sin pasar por EnProceso)', () => {
    expect(() => new EstadoRemediacionValue('Pendiente').transicionarA('Remediada'))
      .toThrow(TransicionDeEstadoInvalidaError);
  });

  test('transición inválida: EnProceso -> Pendiente (no se puede retroceder)', () => {
    expect(() => new EstadoRemediacionValue('EnProceso').transicionarA('Pendiente'))
      .toThrow(TransicionDeEstadoInvalidaError);
  });

  test('transición inválida: Remediada es un estado final, no admite ninguna transición', () => {
    expect(() => new EstadoRemediacionValue('Remediada').transicionarA('EnProceso'))
      .toThrow(TransicionDeEstadoInvalidaError);
    expect(() => new EstadoRemediacionValue('Remediada').transicionarA('Pendiente'))
      .toThrow(TransicionDeEstadoInvalidaError);
  });

  test('el mensaje de error identifica el estado de origen y el destino rechazado', () => {
    expect(() => new EstadoRemediacionValue('Pendiente').transicionarA('Remediada'))
      .toThrow('No se puede pasar de "Pendiente" a "Remediada"');
  });
});
