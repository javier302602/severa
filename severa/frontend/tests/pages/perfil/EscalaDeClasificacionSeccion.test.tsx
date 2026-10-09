import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EscalaDeClasificacionSeccion } from '../../../src/pages/perfil/EscalaDeClasificacionSeccion';
import { RotuloEscala } from '../../../src/components/ui/RotuloEscala';
import { escalaService, type EscalaDeClasificacion } from '../../../src/api/escalaService';
import { HttpError } from '../../../src/api/httpClient';
import { crearQueryClientDePrueba } from '../../testUtils';

vi.mock('../../../src/api/escalaService', () => ({
  escalaService: { obtener: vi.fn(), guardar: vi.fn(), volverACvss: vi.fn() }
}));

// RF-28 / RF-69 (Modo B): el analista configura dónde empieza cada nivel de
// riesgo. Los nombres no cambian; se valida antes de guardar; se puede volver
// a la escala CVSS; y al guardar se refresca todo lo que depende de ella.
const CVSS: EscalaDeClasificacion = {
  personalizada: false,
  cortes: { moderado: 4, alto: 7, critico: 9 },
  rangos: [],
  descripcion: 'Escala CVSS (por defecto)',
  cortesCvss: { moderado: 4, alto: 7, critico: 9 }
};

const PROPIA: EscalaDeClasificacion = {
  ...CVSS,
  personalizada: true,
  cortes: { moderado: 4, alto: 7, critico: 8.5 },
  descripcion: 'Escala personalizada: Moderado desde 4.0, Alto desde 7.0, Crítico desde 8.5'
};

const pedidosDelCatalogo = vi.fn();

// Una consulta del catálogo abierta en otra pantalla, para comprobar que se
// vuelve a pedir al cambiar la escala.
function CatalogoAbierto() {
  const consulta = useQuery({ queryKey: ['catalogo', 'buscar', {}], queryFn: () => pedidosDelCatalogo() });
  return <p>catálogo: {consulta.isSuccess ? 'listo' : 'cargando'}</p>;
}

function renderizar(ruta = '/perfil') {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <QueryClientProvider client={crearQueryClientDePrueba()}>
        <EscalaDeClasificacionSeccion />
        <RotuloEscala />
        <CatalogoAbierto />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const campo = (nombre: string) => screen.getByRole('spinbutton', { name: nombre });

describe('EscalaDeClasificacionSeccion — RF-28 / RF-69', () => {
  afterEach(() => vi.clearAllMocks());

  test('muestra la escala vigente con sus cortes y los cuatro rangos', async () => {
    vi.mocked(escalaService.obtener).mockResolvedValue(CVSS);
    renderizar();

    expect(await screen.findByTestId('escala-vigente')).toHaveTextContent('Vigente: Escala CVSS (por defecto)');
    expect(campo('Moderado desde')).toHaveValue(4);
    expect(campo('Crítico desde')).toHaveValue(9);
    const rangos = within(screen.getByRole('list', { name: 'Cómo queda la escala' })).getAllByRole('listitem');
    expect(rangos.map((item) => item.textContent)).toEqual([
      'BajoCVSS menor que 4.0',
      'ModeradoCVSS desde 4.0 y menor que 7.0',
      'AltoCVSS desde 7.0 y menor que 9.0',
      'CríticoCVSS 9.0 o más'
    ]);
    // Con la escala CVSS no hay nada a qué volver, y sin cambios no hay nada que guardar.
    expect(screen.getByRole('button', { name: /Volver a la escala CVSS/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar escala' })).toBeDisabled();
  });

  test('la vista previa sigue lo que se escribe y valida orden, rango y decimales antes de guardar', async () => {
    vi.mocked(escalaService.obtener).mockResolvedValue(CVSS);
    const usuario = userEvent.setup();
    renderizar();
    await screen.findByTestId('escala-vigente');

    await usuario.clear(campo('Crítico desde'));
    await usuario.type(campo('Crítico desde'), '6');
    expect(screen.getByRole('alert')).toHaveTextContent('Los cortes tienen que ir en orden');
    expect(screen.getByRole('button', { name: 'Guardar escala' })).toBeDisabled();

    await usuario.clear(campo('Crítico desde'));
    await usuario.type(campo('Crítico desde'), '8.55');
    expect(screen.getByRole('alert')).toHaveTextContent('como máximo un decimal');

    await usuario.clear(campo('Crítico desde'));
    await usuario.type(campo('Crítico desde'), '11');
    expect(screen.getByRole('alert')).toHaveTextContent('entre 0.1 y 10.0');

    await usuario.clear(campo('Crítico desde'));
    await usuario.type(campo('Crítico desde'), '8.5');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('CVSS 8.5 o más')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar escala' })).toBeEnabled();
  });

  test('guardar manda los cortes, avisa, actualiza el rótulo y vuelve a pedir lo que depende de la escala', async () => {
    vi.mocked(escalaService.obtener).mockResolvedValue(CVSS);
    vi.mocked(escalaService.guardar).mockResolvedValue(PROPIA);
    pedidosDelCatalogo.mockResolvedValue([]);
    const usuario = userEvent.setup();
    renderizar();
    await screen.findByText('catálogo: listo');
    expect(pedidosDelCatalogo).toHaveBeenCalledTimes(1);

    await usuario.clear(campo('Crítico desde'));
    await usuario.type(campo('Crítico desde'), '8.5');
    await usuario.click(screen.getByRole('button', { name: 'Guardar escala' }));

    expect(escalaService.guardar).toHaveBeenCalledWith({ moderado: 4, alto: 7, critico: 8.5 });
    expect(await screen.findByRole('status')).toHaveTextContent('Guardaste tu escala.');
    expect(screen.getByTestId('escala-vigente')).toHaveTextContent(PROPIA.descripcion);
    expect(screen.getByRole('link', { name: PROPIA.descripcion })).toBeInTheDocument();
    await waitFor(() => expect(pedidosDelCatalogo).toHaveBeenCalledTimes(2));
  });

  test('si el backend rechaza la escala, muestra su motivo', async () => {
    vi.mocked(escalaService.obtener).mockResolvedValue(CVSS);
    vi.mocked(escalaService.guardar).mockRejectedValue(new HttpError(400, 'El corte de Crítico tiene que estar entre 0.1 y 10.0.'));
    const usuario = userEvent.setup();
    renderizar();
    await screen.findByTestId('escala-vigente');

    await usuario.clear(campo('Moderado desde'));
    await usuario.type(campo('Moderado desde'), '3.5');
    await usuario.click(screen.getByRole('button', { name: 'Guardar escala' }));

    expect(await screen.findByText('El corte de Crítico tiene que estar entre 0.1 y 10.0.')).toBeInTheDocument();
  });

  test('con una escala personalizada, se puede volver a la escala CVSS', async () => {
    vi.mocked(escalaService.obtener).mockResolvedValue(PROPIA);
    vi.mocked(escalaService.volverACvss).mockResolvedValue(CVSS);
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(await screen.findByRole('button', { name: 'Volver a la escala CVSS (4.0 / 7.0 / 9.0)' }));

    expect(escalaService.volverACvss).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Volviste a la escala CVSS (por defecto).');
    await waitFor(() => expect(campo('Crítico desde')).toHaveValue(9));
  });

  test('el rótulo de escala es un enlace a esta configuración', async () => {
    vi.mocked(escalaService.obtener).mockResolvedValue(PROPIA);
    renderizar();

    const enlace = await screen.findByRole('link', { name: PROPIA.descripcion });
    expect(enlace).toHaveAttribute('href', '/perfil#escala-de-clasificacion');
    expect(document.getElementById('escala-de-clasificacion')).toBe(screen.getByRole('region', { name: 'Escala de niveles de riesgo' }));
  });

  test('al llegar desde un rótulo (con el ancla en la URL) se desplaza hasta la sección', async () => {
    vi.mocked(escalaService.obtener).mockResolvedValue(CVSS);
    const desplazar = vi.fn();
    Element.prototype.scrollIntoView = desplazar;
    renderizar('/perfil#escala-de-clasificacion');

    await screen.findByTestId('escala-vigente');

    await waitFor(() => expect(desplazar).toHaveBeenCalled());
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });
});

