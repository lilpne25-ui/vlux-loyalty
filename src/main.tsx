import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initInstallCapture, registerServiceWorker } from './lib/pwa';

initInstallCapture();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(<App />);
