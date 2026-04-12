// vite.config.js
import { defineConfig } from 'vite'
import { sharedConfig } from './shared.vite.config.js'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
export default defineConfig(() => {
  return {
    ...sharedConfig,
  }
})