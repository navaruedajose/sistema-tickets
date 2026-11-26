import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import { ProveedorAutenticacion } from './context/AuthContext.jsx';
import { ProveedorAvisos } from './context/AvisosContext.jsx';
import './index.css';

/**
 * Punto de entrada de la aplicacion.
 *
 * Orden de los proveedores (importa):
 *   1. BrowserRouter  -> habilita la navegacion
 *   2. ProveedorAvisos -> las notificaciones visuales deben existir antes que
 *      cualquier componente que quiera emitirlas (incluido el de autenticacion)
 *   3. ProveedorAutenticacion -> depende de los avisos para informar errores
 */
ReactDOM.createRoot(document.getElementById('raiz')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ProveedorAvisos>
        <ProveedorAutenticacion>
          <App />
        </ProveedorAutenticacion>
      </ProveedorAvisos>
    </BrowserRouter>
  </React.StrictMode>
);
