import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The admin console runs alongside the customer web app, on its own port.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
});
