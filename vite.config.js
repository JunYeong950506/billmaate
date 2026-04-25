import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { billmateAiPlugin } from './server/viteAiPlugin';
export default defineConfig({
    plugins: [tailwindcss(), react(), billmateAiPlugin()],
});
