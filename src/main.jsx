import React from 'react';
import { mountApp } from './mountApp';
import App from './App';
import './styles.css';

mountApp(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
