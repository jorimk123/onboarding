import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base '/admin/' — this app is served both standalone (admin.easyonboardings.com)
// and proxied under www.easyonboardings.com/admin/* (see vercel.json). Asset URLs
// are always root-absolute as /admin/assets/..., and vercel.json aliases
// /admin/assets/* back to the real /assets/* files so both paths resolve.
export default defineConfig({ plugins: [react()], base: '/admin/', server: { port: 5173 } });
