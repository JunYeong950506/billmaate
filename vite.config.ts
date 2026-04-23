import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { billmateAiPlugin } from './server/viteAiPlugin';

export default defineConfig({
  plugins: [react(), billmateAiPlugin()],
});
