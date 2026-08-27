import { createRoot } from 'react-dom/client';

import App from './App';
import { bootstrapFrontendEnv } from '@/lib/bootstrap-env';

import './index.css';

bootstrapFrontendEnv();

createRoot(document.getElementById('root')!).render(<App />);
