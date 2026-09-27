import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // Bind every interface, not just loopback.
    //
    // Vite's default is `localhost`, which listens on 127.0.0.1 alone. That
    // is fine on a laptop and wrong in a container: Codespaces (and Docker,
    // and any remote VM) forwards a port by connecting to it from outside
    // that loopback interface, gets ECONNREFUSED, and serves its own "page
    // can't be found" instead of the game — with the dev server sitting
    // there reporting itself ready the whole time.
    host: true,
  },
});
