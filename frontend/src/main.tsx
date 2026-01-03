import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';

import App from './App';
import { installErrorReporter } from './lib/errorReporter';

// Inter — body font (Kaggle-aligned). Geist kept available for legacy callers
// but no longer the primary sans. Geist Mono still used for code/kbd/samp.
import '@fontsource-variable/inter';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/global.css';

dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.locale('ru');

installErrorReporter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
