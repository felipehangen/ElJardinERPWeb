import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
// Prevent scroll wheel from changing numbers in number inputs globally
document.addEventListener('wheel', (e) => {
    const active = document.activeElement as HTMLInputElement | null;
    if (active && active.tagName === 'INPUT' && active.type === 'number') {
        e.preventDefault();
    }
}, { passive: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
