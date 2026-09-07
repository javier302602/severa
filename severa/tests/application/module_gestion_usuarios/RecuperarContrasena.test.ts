import { RecuperarContrasena } from '../../../src/application/usecases/module_gestion_usuarios/RecuperarContrasena';
import { AnalistaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { TokenRecuperacionRepository } from '../../../src/application/ports/out/persistencia/repositorios/TokenRecuperacionRepository';
import { EnviadorDeCorreo } from '../../../src/application/ports/out/notificaciones/EnviadorDeCorreo';
import { Analista } from '../../../src/domain/entities/Analista';
import { Correo } from '../../../src/domain/shared/value-objects/Correo';

function analistaRepositorioFalso(analistaExistente: Analista | null): AnalistaRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(analistaExistente),
    buscarPorId: jest.fn().mockResolvedValue(null),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };
}

function tokenRepositorioFalso(): TokenRecuperacionRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorHash: jest.fn().mockResolvedValue(null),
    invalidarVigentesDeAnalista: jest.fn().mockResolvedValue(undefined)
  };
}

function enviadorDeCorreoFalso(): EnviadorDeCorreo {
  return { enviarEnlaceDeRecuperacion: jest.fn().mockResolvedValue(undefined) };
}

describe('RecuperarContrasena', () => {
  test('si el correo existe, invalida tokens vigentes previos, genera uno nuevo y lo envía', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaRepository = analistaRepositorioFalso(analista);
    const tokenRepository = tokenRepositorioFalso();
    const enviadorDeCorreo = enviadorDeCorreoFalso();
    const usecase = new RecuperarContrasena(analistaRepository, tokenRepository, enviadorDeCorreo);

    const resultado = await usecase.ejecutar({ correo: 'ana@example.com' });

    expect(resultado).toEqual({ analistaId: '1' });
    expect(tokenRepository.invalidarVigentesDeAnalista).toHaveBeenCalledWith('1');
    expect(tokenRepository.guardar).toHaveBeenCalledWith(expect.objectContaining({ analistaId: '1', usado: false }));
    expect(enviadorDeCorreo.enviarEnlaceDeRecuperacion).toHaveBeenCalledWith(
      'ana@example.com',
      expect.any(String)
    );

    // El token enviado por correo debe ser el mismo que se hasheó y guardó
    // (no el hash) — si no, nadie podría restablecer nunca su contraseña.
    const tokenEnviado = (enviadorDeCorreo.enviarEnlaceDeRecuperacion as jest.Mock).mock.calls[0][1];
    const tokenGuardado = (tokenRepository.guardar as jest.Mock).mock.calls[0][0];
    expect(tokenGuardado.tokenHash).not.toBe(tokenEnviado);
  });

  test('si el correo no existe, no genera token ni envía nada (anti-enumeración)', async () => {
    const analistaRepository = analistaRepositorioFalso(null);
    const tokenRepository = tokenRepositorioFalso();
    const enviadorDeCorreo = enviadorDeCorreoFalso();
    const usecase = new RecuperarContrasena(analistaRepository, tokenRepository, enviadorDeCorreo);

    const resultado = await usecase.ejecutar({ correo: 'no-existe@example.com' });

    expect(resultado).toBeNull();
    expect(tokenRepository.guardar).not.toHaveBeenCalled();
    expect(enviadorDeCorreo.enviarEnlaceDeRecuperacion).not.toHaveBeenCalled();
  });
});
