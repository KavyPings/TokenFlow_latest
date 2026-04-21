import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const root = document.getElementById('root');
const app = <App />;

ReactDOM.createRoot(root).render(
  import.meta.env.DEV ? app : (
    <React.StrictMode>
      {app}
    </React.StrictMode>
  )
);
