import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../api/authService';
import { RUTAS } from '../../routes/paths';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';

// Regla replicada de Correo.ts. La contraseña solo exige "no vacía": el
// backend (BcryptHasher + RegistrarAnalista) no impone longitud mínima ni
// complejidad — no se inventa acá una regla que el backend no aplica.
const esquemaRegistro = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  correo: z.string().min(1, 'El correo es obligatorio').email('Correo inválido'),
  contrasena: z.string().min(1, 'La contraseña es obligatoria')
});

type DatosRegistro = z.infer<typeof esquemaRegistro>;

export function RegistroPage() {
  const navigate = useNavigate();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<DatosRegistro>({ resolver: zodResolver(esquemaRegistro) });

  const onSubmit = async (datos: DatosRegistro) => {
    setErrorEnvio(null);
    try {
      // El backend exige un `id` provisto por el cliente (RegistrarAnalista no
      // genera uno) y acepta cualquier `rol` sin restricción — se fija
      // 'analista' acá a propósito, sin exponer un selector de rol en el
      // registro público (ver huecos reportados: nada en el backend impide
      // auto-registrarse como 'administrador').
      await authService.registrar({ ...datos, id: crypto.randomUUID(), rol: 'analista' });
      navigate(RUTAS.login, { state: { mensaje: 'Cuenta creada. Iniciá sesión para continuar.' } });
    } catch (error) {
      setErrorEnvio(mensajeDeError(error));
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Crear cuenta — SEVERA</h1>

        {errorEnvio && <MensajeError mensaje={errorEnvio} />}

        <div>
          <label htmlFor="nombre" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Nombre
          </label>
          <input
            id="nombre"
            type="text"
            autoComplete="name"
            {...register('nombre')}
            className="campo-formulario mt-1 w-full"
          />
          {errors.nombre && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.nombre.message}</p>}
        </div>

        <div>
          <label htmlFor="correo" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Correo
          </label>
          <input
            id="correo"
            type="email"
            autoComplete="email"
            {...register('correo')}
            className="campo-formulario mt-1 w-full"
          />
          {errors.correo && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.correo.message}</p>}
        </div>

        <div>
          <label htmlFor="contrasena" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Contraseña
          </label>
          <input
            id="contrasena"
            type="password"
            autoComplete="new-password"
            {...register('contrasena')}
            className="campo-formulario mt-1 w-full"
          />
          {errors.contrasena && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.contrasena.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
        >
          {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          ¿Ya tenés cuenta?{' '}
          <Link to={RUTAS.login} className="text-slate-900 dark:text-slate-100 underline">
            Iniciá sesión
          </Link>
        </p>
      </form>
    </div>
  );
}
