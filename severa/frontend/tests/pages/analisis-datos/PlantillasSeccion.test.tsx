import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { PlantillasSeccion } from '../../../src/pages/analisis-datos/PlantillasSeccion';
import { useEstadisticasDescriptivas } from '../../../src/hooks/useAnalisisDatos';
import {
  analisisDatosService,
  type PlantillaDeAnalisis,
  type ResultadoDeAplicacionDePlantilla,
  type VistaPreviaDePlantilla
} from '../../../src/api/analisisDatosService';
import { HttpError } from '../../../src/api/httpClient';
import { crearQueryClientDePrueba } from '../../testUtils';

vi.mock('../../../src/api/analisisDatosService', () => ({
  analisisDatosService: {
    listarPlantillas: vi.fn(),
    guardarPlantilla: vi.fn(),
    eliminarPlantilla: vi.fn(),
    previsualizarPlantilla: vi.fn(),
    aplicarPlantilla: vi.fn(),
    obtenerEstadisticasDescriptivas: vi.fn()
  }
}));

// RF-12 (M-02): guardar una plantilla con nombre y reaplicarla sobre otro
// dataset compatible, viendo antes qué cambia y confirmando.
const PLANTILLA: PlantillaDeAnalisis = {
  id: 'p1',
  nombre: 'Encuesta mensual',
  fechaCreacion: '2026-10-01T12:00:00.000Z',
  configuracion: {
    tiposCorregidos: { edad: 'numerica_continua' },
    variableObjetivo: 'aprobado',
    clasificacion: {
      criterio: { nombreColumna: 'nivel', tipo: 'ordinal', ordenCategorias: ['Bajo', 'Medio'] },
      columnaClave: 'codigo'
    }
  },
  columnas: ['edad', 'aprobado', 'nivel', 'codigo']
};

const DATOS = { plantilla: { id: 'p1', nombre: 'Encuesta mensual' }, datasetOriginalId: 'd2', nombreArchivo: 'abril.csv', version: 0 };

const VISTA: VistaPreviaDePlantilla = {
  ...DATOS,
  huella: 'huella-1',
  plan: {
    aplicable: true,
    columnasFaltantes: [],
    problemas: [],
    yaVigentes: 0,
    cambios: [
      { tipo: 'tipo_de_variable', columna: 'edad', tipoActual: 'numerica_discreta', tipoNuevo: 'numerica_continua' },
      { tipo: 'variable_objetivo', columna: 'aprobado', actual: { estado: 'pendiente', columna: null } },
      {
        tipo: 'criterio_de_clasificacion',
        criterioActual: null,
        criterioNuevo: { nombreColumna: 'nivel', tipo: 'ordinal', ordenCategorias: ['Bajo', 'Medio'] },
        columnaClaveActual: null,
        columnaClaveNueva: 'codigo',
        categoriasSinOrden: ['Alto']
      }
    ]
  }
};

const RESULTADO: ResultadoDeAplicacionDePlantilla = {
  ...DATOS,
  cambiosAplicados: VISTA.plan.cambios,
  tiposCorregidos: { edad: 'numerica_continua' },
  diagnostico: { totalFilas: 12, filasDuplicadas: 0, columnas: [] }
};

// Una pestaña de análisis abierta al mismo tiempo, para comprobar que se
// recalcula al aplicar la plantilla.
function DescriptivasAbiertas() {
  const consulta = useEstadisticasDescriptivas('sesion-1');
  return <p>descriptivas: {consulta.isSuccess ? 'listas' : 'cargando'}</p>;
}

function renderizar(onPlantillaAplicada = vi.fn()) {
  render(
    <QueryClientProvider client={crearQueryClientDePrueba()}>
      <PlantillasSeccion sesionId="sesion-1" onReiniciar={vi.fn()} onPlantillaAplicada={onPlantillaAplicada} />
      <DescriptivasAbiertas />
    </QueryClientProvider>
  );
  return { onPlantillaAplicada };
}

function prepararServicio(plantillas: PlantillaDeAnalisis[] = [PLANTILLA]) {
  vi.mocked(analisisDatosService.listarPlantillas).mockResolvedValue(plantillas);
  vi.mocked(analisisDatosService.obtenerEstadisticasDescriptivas).mockResolvedValue({ columnas: [] });
}

async function abrirVistaPrevia(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(await screen.findByRole('button', { name: 'Ver qué cambia si aplicás Encuesta mensual' }));
}

describe('PlantillasSeccion — RF-12', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('lista las plantillas del analista con lo que trae cada una', async () => {
    prepararServicio();
    renderizar();

    expect(await screen.findByText('Encuesta mensual')).toBeInTheDocument();
    expect(screen.getByText('Tipos: edad como numérica continua')).toBeInTheDocument();
    expect(screen.getByText('Variable objetivo: aprobado')).toBeInTheDocument();
    expect(screen.getByText('Criterio de clasificación: «nivel» por orden de categorías (Bajo < Medio); columna clave: codigo')).toBeInTheDocument();
  });

  test('sin plantillas, lo dice', async () => {
    prepararServicio([]);
    renderizar();

    expect(await screen.findByText('Todavía no guardaste ninguna plantilla.')).toBeInTheDocument();
  });

  test('guarda la configuración con el nombre escrito y lo confirma', async () => {
    prepararServicio([]);
    vi.mocked(analisisDatosService.guardarPlantilla).mockResolvedValue({ ...PLANTILLA, nombre: 'Mensual' });
    const usuario = userEvent.setup();
    renderizar();

    const guardar = screen.getByRole('button', { name: 'Guardar plantilla' });
    expect(guardar).toBeDisabled();
    await usuario.type(screen.getByPlaceholderText('Nombre de la plantilla'), 'Mensual');
    await usuario.click(guardar);

    expect(analisisDatosService.guardarPlantilla).toHaveBeenCalledWith('sesion-1', 'Mensual');
    expect(await screen.findByText('Guardaste la plantilla «Mensual».')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Nombre de la plantilla')).toHaveValue('');
  });

  test('un nombre repetido muestra el motivo y no limpia lo escrito', async () => {
    prepararServicio();
    vi.mocked(analisisDatosService.guardarPlantilla).mockRejectedValue(
      new HttpError(409, 'Ya tenés una plantilla con el nombre "encuesta mensual" (sin distinguir mayúsculas). Elegí otro nombre o eliminá la anterior.')
    );
    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(screen.getByPlaceholderText('Nombre de la plantilla'), 'encuesta mensual');
    await usuario.click(screen.getByRole('button', { name: 'Guardar plantilla' }));

    expect(await screen.findByText(/Ya tenés una plantilla con el nombre/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Nombre de la plantilla')).toHaveValue('encuesta mensual');
  });

  test('el nombre no admite más de 80 caracteres', () => {
    prepararServicio([]);
    renderizar();

    expect(screen.getByPlaceholderText('Nombre de la plantilla')).toHaveAttribute('maxLength', '80');
  });

  test('la vista previa muestra qué cambia, nombra la variable objetivo y avisa las categorías sin orden; no aplica nada sin confirmar', async () => {
    prepararServicio();
    vi.mocked(analisisDatosService.previsualizarPlantilla).mockResolvedValue(VISTA);
    const usuario = userEvent.setup();
    renderizar();

    await abrirVistaPrevia(usuario);

    const cambios = await screen.findByRole('list', { name: 'Cambios que se van a aplicar' });
    const items = within(cambios).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Tipo de edad: numérica discreta → numérica continua',
      'Se confirma aprobado como variable objetivo (hoy no hay ninguna confirmada)',
      'Criterio de clasificación: «nivel» por orden de categorías (Bajo < Medio); columna clave «codigo»'
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'En este dataset, «nivel» tiene categorías que la plantilla no ordena: Alto. Esas filas van a quedar «Sin clasificar».'
    );
    expect(analisisDatosService.previsualizarPlantilla).toHaveBeenCalledWith('sesion-1', 'p1');
    expect(analisisDatosService.aplicarPlantilla).not.toHaveBeenCalled();
  });

  test('confirmar aplica con la huella de la vista previa, avisa, refresca la pantalla y recalcula los análisis abiertos', async () => {
    prepararServicio();
    vi.mocked(analisisDatosService.previsualizarPlantilla).mockResolvedValue(VISTA);
    vi.mocked(analisisDatosService.aplicarPlantilla).mockResolvedValue(RESULTADO);
    const usuario = userEvent.setup();
    const { onPlantillaAplicada } = renderizar();
    await screen.findByText('descriptivas: listas');
    expect(analisisDatosService.obtenerEstadisticasDescriptivas).toHaveBeenCalledTimes(1);

    await abrirVistaPrevia(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Confirmar y aplicar' }));

    expect(analisisDatosService.aplicarPlantilla).toHaveBeenCalledWith('sesion-1', 'p1', 'huella-1');
    expect(await screen.findByText(/Se aplicó la plantilla «Encuesta mensual»: 3 cambio\(s\)\./)).toBeInTheDocument();
    expect(onPlantillaAplicada).toHaveBeenCalledWith(RESULTADO);
    await waitFor(() => expect(analisisDatosService.obtenerEstadisticasDescriptivas).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'Confirmar y aplicar' })).not.toBeInTheDocument();
  });

  test('una plantilla incompatible dice qué columnas faltan y no ofrece aplicar', async () => {
    prepararServicio();
    vi.mocked(analisisDatosService.previsualizarPlantilla).mockResolvedValue({
      ...VISTA,
      plan: { aplicable: false, columnasFaltantes: ['aprobado', 'codigo'], problemas: [], cambios: [], yaVigentes: 0 }
    });
    const usuario = userEvent.setup();
    renderizar();

    await abrirVistaPrevia(usuario);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('La plantilla «Encuesta mensual» no se puede aplicar a este dataset. No se va a cambiar nada.');
    expect(aviso).toHaveTextContent('Le faltan las columnas: aprobado, codigo.');
    expect(screen.queryByRole('button', { name: 'Confirmar y aplicar' })).not.toBeInTheDocument();
  });

  test('si ya está aplicada, dice que no hay nada que cambiar', async () => {
    prepararServicio();
    vi.mocked(analisisDatosService.previsualizarPlantilla).mockResolvedValue({
      ...VISTA,
      plan: { aplicable: true, columnasFaltantes: [], problemas: [], cambios: [], yaVigentes: 3 }
    });
    const usuario = userEvent.setup();
    renderizar();

    await abrirVistaPrevia(usuario);

    expect(await screen.findByText(/no hay nada que cambiar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar y aplicar' })).not.toBeInTheDocument();
  });

  test('si la vista previa quedó vieja, muestra el motivo y vuelve a pedirla con lo que falta', async () => {
    prepararServicio();
    vi.mocked(analisisDatosService.previsualizarPlantilla)
      .mockResolvedValueOnce(VISTA)
      .mockResolvedValueOnce({ ...VISTA, huella: 'huella-2', plan: { ...VISTA.plan, cambios: VISTA.plan.cambios.slice(2), yaVigentes: 2 } });
    vi.mocked(analisisDatosService.aplicarPlantilla).mockRejectedValue(
      new HttpError(409, 'Los cambios pendientes ya no son los que viste en la vista previa. Volvé a revisarlos antes de confirmar.')
    );
    const usuario = userEvent.setup();
    renderizar();

    await abrirVistaPrevia(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Confirmar y aplicar' }));

    expect(await screen.findByText(/ya no son los que viste en la vista previa/)).toBeInTheDocument();
    expect(await screen.findByText('2 ajuste(s) de la plantilla ya estaban aplicados y no se tocan.')).toBeInTheDocument();
    expect(analisisDatosService.previsualizarPlantilla).toHaveBeenCalledTimes(2);
  });

  test('eliminar pide confirmación antes de borrar', async () => {
    prepararServicio();
    vi.mocked(analisisDatosService.eliminarPlantilla).mockResolvedValue(undefined);
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(await screen.findByRole('button', { name: 'Eliminar Encuesta mensual' }));
    expect(analisisDatosService.eliminarPlantilla).not.toHaveBeenCalled();

    await usuario.click(screen.getByRole('button', { name: 'Sí, eliminarla' }));
    expect(analisisDatosService.eliminarPlantilla).toHaveBeenCalledWith('p1');
  });
});
