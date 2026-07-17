import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { esSesionNoEncontrada } from '../../utils/esSesionNoEncontrada';
import { mensajeDeError } from '../../utils/mensajeDeError';

// Compartido por las 4 secciones (estadísticas descriptivas, univariado,
// correlación, outliers) y por la descarga del informe: mismo criterio de
// error en las 5 rutas que reciben sesionId. Sesión expirada/inexistente
// (404) es un caso esperado, no un error genérico — se distingue con un
// aviso claro y una acción concreta en vez de un cartel rojo.
export function AvisoErrorSeccion({ error, onReiniciar }: { error: unknown; onReiniciar: () => void }) {
  if (esSesionNoEncontrada(error)) {
    return (
      <EstadoVacio
        mensaje={
          <>
            <p>Tu sesión de análisis expiró o no se encontró. Volvé a subir el archivo para continuar.</p>
            <button
              type="button"
              onClick={onReiniciar}
              className="mt-3 rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              Subir otro archivo
            </button>
          </>
        }
      />
    );
  }

  return <MensajeError mensaje={mensajeDeError(error)} />;
}
