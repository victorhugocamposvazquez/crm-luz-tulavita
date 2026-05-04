import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './App.css'
import { registerCrmServiceWorker } from '@/lib/pwa/registerCrmServiceWorker'

registerCrmServiceWorker()

createRoot(document.getElementById("root")!).render(<App />);