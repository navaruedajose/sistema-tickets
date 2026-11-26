import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { useAutenticacion } from '../context/AuthContext';
import { useAvisos } from '../context/AvisosContext';

/**
 * Pantalla de registro publico.
 *
 * Nota de seguridad importante: el registro publico SIEMPRE crea cuentas con
 * rol SOLICITANTE. El backend lo fuerza, aunque alguien envie "rol":
 * "ADMINISTRADOR" en el cuerpo de la peticion. Esa es una de las primeras
 * cosas que un cliente toxico intentara; conviene tenerla presente.
 *
 * Aqui se replica la politica de contrasena del backend para dar
 * retroalimentacion inmediata, pero la validacion que manda es la del servidor.
 */

const REQUISITOS_CONTRASENA = [
  { clave: 'longitud', texto: 'Al menos 8 caracteres', prueba: (valor) => valor.length >= 8 },
  { clave: 'mayuscula', texto: 'Una letra mayuscula', prueba: (valor) => /[A-Z]/.test(valor) },
  { clave: 'minuscula', texto: 'Una letra minuscula', prueba: (valor) => /[a-z]/.test(valor) },
  { clave: 'numero', texto: 'Un numero', prueba: (valor) => /[0-9]/.test(valor) },
];

export default function Registro() {
  const { registrarse, autenticado, cargando } = useAutenticacion();
  const { exito, mostrarError } = useAvisos();
  const navegar = useNavigate();

  const [formulario, setFormulario] = useState({
    nombreCompleto: '',
    correo: '',
    contrasena: '',
    confirmarContrasena: '',
    telefono: '',
    departamento: '',
  });

  const [enviando, setEnviando] = useState(false);
  const [erroresCampo, setErroresCampo] = useState({});
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  if (!cargando && autenticado) {
    return <Navigate to="/" replace />;
  }

  function actualizarCampo(campo, valor) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
    if (erroresCampo[campo]) {
      setErroresCampo((actual) => ({ ...actual, [campo]: undefined }));
    }
  }

  function validar() {
    const nuevos = {};

    if (formulario.nombreCompleto.trim().length < 3) {
      nuevos.nombreCompleto = 'Ingrese su nombre completo (minimo 3 caracteres).';
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formulario.correo.trim())) {
      nuevos.correo = 'Ingrese un correo electronico valido.';
    }
    if (!REQUISITOS_CONTRASENA.every((requisito) => requisito.prueba(formulario.contrasena))) {
      nuevos.contrasena = 'La contrasena no cumple con todos los requisitos de seguridad.';
    }
    if (formulario.contrasena !== formulario.confirmarContrasena) {
      nuevos.confirmarContrasena = 'Las contrasenas no coinciden.';
    }
    if (formulario.telefono && !/^[+]?[0-9\s()-]{7,25}$/.test(formulario.telefono.trim())) {
      nuevos.telefono = 'El telefono no tiene un formato valido.';
    }
    if (!aceptaTerminos) {
      nuevos.terminos = 'Debe aceptar el tratamiento de datos para continuar.';
    }

    setErroresCampo(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    if (!validar()) return;

    setEnviando(true);
    try {
      // Se omiten los campos vacios para no enviar cadenas vacias al backend.
      const carga = {
        nombreCompleto: formulario.nombreCompleto.trim(),
        correo: formulario.correo.trim().toLowerCase(),
        contrasena: formulario.contrasena,
      };
      if (formulario.telefono.trim()) carga.telefono = formulario.telefono.trim();
      if (formulario.departamento.trim()) carga.departamento = formulario.departamento.trim();

      const usuario = await registrarse(carga);

      exito(
        'Cuenta creada correctamente',
        `Bienvenido, ${usuario.nombre_completo}. Ya puede registrar sus solicitudes de soporte.`
      );
      navegar('/', { replace: true });
    } catch (error) {
      const porCampo = error?.erroresPorCampo || {};
      if (Object.keys(porCampo).length > 0) {
        // El backend devuelve las rutas como "body.correo"; se normaliza la clave.
        const normalizados = {};
        Object.entries(porCampo).forEach(([clave, mensaje]) => {
          normalizados[clave.replace(/^body\./, '')] = mensaje;
        });
        setErroresCampo(normalizados);
      } else {
        mostrarError(error, 'No fue posible crear la cuenta');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-marca-600 text-base font-bold text-white">
            ST
          </span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Crear una cuenta</h1>
          <p className="mt-1 text-sm text-slate-500">
            Registrese para reportar incidencias y dar seguimiento a sus solicitudes.
          </p>
        </div>

        <div className="tarjeta">
          <div className="tarjeta-cuerpo">
            <form onSubmit={manejarEnvio} className="space-y-5" noValidate>
              {/* Nombre */}
              <div>
                <label htmlFor="nombreCompleto" className="etiqueta-campo">
                  Nombre completo <span className="text-rose-600">*</span>
                </label>
                <input
                  id="nombreCompleto"
                  className="campo"
                  placeholder="Ana Torres Rivera"
                  autoComplete="name"
                  value={formulario.nombreCompleto}
                  onChange={(evento) => actualizarCampo('nombreCompleto', evento.target.value)}
                  aria-invalid={Boolean(erroresCampo.nombreCompleto)}
                />
                {erroresCampo.nombreCompleto ? (
                  <p className="texto-error">{erroresCampo.nombreCompleto}</p>
                ) : null}
              </div>

              {/* Correo */}
              <div>
                <label htmlFor="correoRegistro" className="etiqueta-campo">
                  Correo electronico <span className="text-rose-600">*</span>
                </label>
                <input
                  id="correoRegistro"
                  type="email"
                  className="campo"
                  placeholder="usuario@dominio.com"
                  autoComplete="email"
                  value={formulario.correo}
                  onChange={(evento) => actualizarCampo('correo', evento.target.value)}
                  aria-invalid={Boolean(erroresCampo.correo)}
                />
                {erroresCampo.correo ? <p className="texto-error">{erroresCampo.correo}</p> : null}
              </div>

              {/* Contrasena */}
              <div>
                <label htmlFor="contrasenaRegistro" className="etiqueta-campo">
                  Contrasena <span className="text-rose-600">*</span>
                </label>
                <input
                  id="contrasenaRegistro"
                  type="password"
                  className="campo"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={formulario.contrasena}
                  onChange={(evento) => actualizarCampo('contrasena', evento.target.value)}
                  aria-invalid={Boolean(erroresCampo.contrasena)}
                />

                {/* Lista de requisitos con marca en vivo */}
                <ul className="mt-2 grid grid-cols-2 gap-1">
                  {REQUISITOS_CONTRASENA.map((requisito) => {
                    const cumplido = requisito.prueba(formulario.contrasena);
                    return (
                      <li
                        key={requisito.clave}
                        className={`flex items-center gap-1.5 text-xs ${
                          cumplido ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        <span aria-hidden="true">{cumplido ? '✓' : '○'}</span>
                        {requisito.texto}
                      </li>
                    );
                  })}
                </ul>

                {erroresCampo.contrasena ? (
                  <p className="texto-error">{erroresCampo.contrasena}</p>
                ) : null}
              </div>

              {/* Confirmar contrasena */}
              <div>
                <label htmlFor="confirmarContrasena" className="etiqueta-campo">
                  Confirmar contrasena <span className="text-rose-600">*</span>
                </label>
                <input
                  id="confirmarContrasena"
                  type="password"
                  className="campo"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={formulario.confirmarContrasena}
                  onChange={(evento) => actualizarCampo('confirmarContrasena', evento.target.value)}
                  aria-invalid={Boolean(erroresCampo.confirmarContrasena)}
                />
                {erroresCampo.confirmarContrasena ? (
                  <p className="texto-error">{erroresCampo.confirmarContrasena}</p>
                ) : null}
              </div>

              {/* Campos opcionales */}
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="telefono" className="etiqueta-campo">
                    Telefono <span className="text-slate-400">(opcional)</span>
                  </label>
                  <input
                    id="telefono"
                    className="campo"
                    placeholder="+52 55 1111 2222"
                    autoComplete="tel"
                    value={formulario.telefono}
                    onChange={(evento) => actualizarCampo('telefono', evento.target.value)}
                  />
                  <p className="texto-ayuda">
                    Se usa para enviarle avisos por SMS cuando su ticket se resuelva.
                  </p>
                  {erroresCampo.telefono ? (
                    <p className="texto-error">{erroresCampo.telefono}</p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="departamento" className="etiqueta-campo">
                    Departamento <span className="text-slate-400">(opcional)</span>
                  </label>
                  <input
                    id="departamento"
                    className="campo"
                    placeholder="Recursos Humanos"
                    value={formulario.departamento}
                    onChange={(evento) => actualizarCampo('departamento', evento.target.value)}
                  />
                </div>
              </div>

              {/* Consentimiento */}
              <div>
                <label className="flex items-start gap-2.5 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-marca-700 focus:ring-marca-500"
                    checked={aceptaTerminos}
                    onChange={(evento) => {
                      setAceptaTerminos(evento.target.checked);
                      if (erroresCampo.terminos) {
                        setErroresCampo((actual) => ({ ...actual, terminos: undefined }));
                      }
                    }}
                  />
                  <span>
                    Acepto que mis datos sean tratados conforme al aviso de privacidad, unicamente
                    para la gestion de mis solicitudes de soporte.
                  </span>
                </label>
                {erroresCampo.terminos ? (
                  <p className="texto-error">{erroresCampo.terminos}</p>
                ) : null}
              </div>

              <button type="submit" className="boton-primario w-full" disabled={enviando}>
                {enviando ? 'Creando su cuenta...' : 'Crear cuenta'}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Ya tiene una cuenta?{' '}
          <Link to="/iniciar-sesion" className="enlace">
            Inicie sesion
          </Link>
        </p>
      </div>
    </div>
  );
}
