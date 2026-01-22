import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';

import App from './App';
import { installErrorReporter } from './lib/errorReporter';

// Inter — body font (Kaggle-aligned). The `@fontsource-variable/inter`
// default export is the `wght.css` subset already (we verified with
// `diff index.css wght.css` — identical), so no `/wght.css` suffix is
// required to get the slim weight-only variant.
//
// Geist Mono is the only mono face the UI actually paints (code/pre/
// kbd/samp + .assignment-prose code, see styles/global.css). The Geist
// sans face was loaded for "legacy callers" that never materialised —
// no CSS rule references `'Geist Variable'`, so dropping the import
// cuts ~58 KB of woff2 + the parse cost of 6 @font-face declarations
// from the cold-load critical path.
import '@fontsource-variable/inter';
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
