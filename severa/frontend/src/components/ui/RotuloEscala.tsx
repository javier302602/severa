import { Link } from 'react-router-dom';
import { useEscalaDeClasificacion } from '../../hooks/useEscalaDeClasificacion';
import { RUTA_CONFIGURAR_ESCALA } from '../../routes/paths';

// RF-28 / RF-69: toda pantalla que muestra niveles de riesgo dice con qué
// escala los calculó, y el rótulo lleva a donde se configura.
//
// `descripcion`: la escala con la que el backend armó esa respuesta (por
// ejemplo, la ficha la trae junto con el nivel). Sin ella, se muestra la
// vigente.
export function RotuloEscala({ descripcion }: { descripcion?: string }) {
  const { data } = useEscalaDeClasificacion();
  const texto = descripcion ?? data?.descripcion;
  if (!texto) return null;

  return (
    <Link
      to={RUTA_CONFIGURAR_ESCALA}
      className="inline-block text-xs text-slate-600 underline decoration-dotted underline-offset-2 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      title="Configurar la escala de niveles de riesgo"
    >
      {texto}
    </Link>
  );
}
