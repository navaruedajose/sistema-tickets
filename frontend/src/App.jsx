import { Navigate, Route, Routes } from 'react-router-dom';

import Disposicion from './componentes/Disposicion';
import RutaProtegida from './componentes/RutaProtegida';

import IniciarSesion from './paginas/IniciarSesion';
import Registro from './paginas/Registro';
import Panel from './paginas/Panel';
import ListaTickets from './paginas/ListaTickets';
import NuevoTicket from './paginas/NuevoTicket';
import DetalleTicket from './paginas/DetalleTicket';
import Reportes from './paginas/Reportes';
import Usuarios from './paginas/Usuarios';
import Categorias from './paginas/Categorias';
import Perfil from './paginas/Perfil';
import NoEncontrado from './paginas/NoEncontrado';

/**
 * Mapa de rutas de la aplicacion.
 *
 * Estructura:
 *   - Rutas publicas: /iniciar-sesion y /registro.
 *   - Rutas privadas: todo lo demas, envuelto en <RutaProtegida> y dentro de
 *     <Disposicion>, que aporta la barra lateral y el encabezado.
 *
 * El control de roles se declara aqui, en un solo lugar, de modo que la
 * politica de acceso es auditable de un vistazo (y se puede mostrar en la
 * sustentacion como evidencia de diseno).
 */
export default function App() {
  return (
    <Routes>
      {/* ---------------- Rutas publicas ---------------- */}
      <Route path="/iniciar-sesion" element={<IniciarSesion />} />
      <Route path="/registro" element={<Registro />} />

      {/* ---------------- Rutas privadas ---------------- */}
      <Route
        element={
          <RutaProtegida>
            <Disposicion />
          </RutaProtegida>
        }
      >
        <Route index element={<Panel />} />
        <Route path="tickets" element={<ListaTickets />} />
        <Route path="tickets/nuevo" element={<NuevoTicket />} />
        <Route path="tickets/:id" element={<DetalleTicket />} />
        <Route path="perfil" element={<Perfil />} />

        {/* Reportes: agentes y administradores */}
        <Route
          path="reportes"
          element={
            <RutaProtegida roles={['AGENTE', 'ADMINISTRADOR']}>
              <Reportes />
            </RutaProtegida>
          }
        />

        {/* Administracion: solo administradores */}
        <Route
          path="usuarios"
          element={
            <RutaProtegida roles={['ADMINISTRADOR']}>
              <Usuarios />
            </RutaProtegida>
          }
        />
        <Route
          path="categorias"
          element={
            <RutaProtegida roles={['ADMINISTRADOR']}>
              <Categorias />
            </RutaProtegida>
          }
        />
      </Route>

      {/* ---------------- Comodin ---------------- */}
      <Route path="/404" element={<NoEncontrado />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
