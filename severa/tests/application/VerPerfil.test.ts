import { VerPerfil } from '../../src/application/usecases/VerPerfil';
import { AnalistaRepository } from '../../src/application/ports/out/AnalistaRepository';
import { Analista } from '../../src/domain/entities/Analista';
import { Correo } from '../../src/domain/value-objects/Correo';

describe('VerPerfil', () => {
  test('devuelve el analista correspondiente al id recibido, a través del repositorio', async () => {
    const analistaA = new Analista('analista-A', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaRepository: AnalistaRepository = {
      guardar: jest.fn(),
      buscarPorCorreo: jest.fn(),
      buscarPorId: jest.fn().mockResolvedValue(analistaA),
      eliminar: jest.fn()
    };

    const usecase = new VerPerfil(analistaRepository);
    const resultado = await usecase.ejecutar('analista-A');

    expect(analistaRepository.buscarPorId).toHaveBeenCalledWith('analista-A');
    expect(resultado).toBe(analistaA);
  });

  test('nunca devuelve datos de un analista distinto al id pedido: buscarPorId solo recibe ese id, no otro', async () => {
    const analistaB = new Analista('analista-B', 'Beto', new Correo('beto@example.com'), 'hash', 'analista');
    const buscarPorId = jest.fn().mockResolvedValue(analistaB);
    const analistaRepository: AnalistaRepository = {
      guardar: jest.fn(),
      buscarPorCorreo: jest.fn(),
      buscarPorId,
      eliminar: jest.fn()
    };

    const usecase = new VerPerfil(analistaRepository);
    await usecase.ejecutar('analista-B');

    expect(buscarPorId).toHaveBeenCalledTimes(1);
    expect(buscarPorId).not.toHaveBeenCalledWith('analista-A');
  });

  test('lanza error si el analista no existe', async () => {
    const analistaRepository: AnalistaRepository = {
      guardar: jest.fn(),
      buscarPorCorreo: jest.fn(),
      buscarPorId: jest.fn().mockResolvedValue(null),
      eliminar: jest.fn()
    };

    const usecase = new VerPerfil(analistaRepository);
    await expect(usecase.ejecutar('no-existe')).rejects.toThrow('Analista no encontrado');
  });
});
