import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Disable mouse scroll altering number inputs globally
document.addEventListener('wheel', (event) => {
    const target = document.activeElement as HTMLInputElement;
    if (target && target.tagName === 'INPUT' && target.type === 'number') {
        event.preventDefault();
        target.blur();
    }
}, { passive: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
