import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './mobile.css'
import { startExitAnimations } from './exitAnimations'
import { installBackend } from '../../backend/api'

installBackend()
startExitAnimations()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
