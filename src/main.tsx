import React from 'react'
import ReactDOM from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/lora/400.css'
import './styles/globals.css'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
