// Construye dist/index.html autocontenido (JS + CSS en línea) para publicarlo como Artifact.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
execSync('npx tailwindcss -c tailwind.config.js -i src/styles.css -o dist/app.css --minify', { stdio: 'inherit' });
await build({ entryPoints: ['src/main.tsx'], bundle: true, minify: true, format: 'iife', target: 'es2019', outfile: 'dist/app.js', define: { 'process.env.NODE_ENV': '"production"' }, jsx: 'automatic', legalComments: 'none' });
const css = readFileSync('dist/app.css', 'utf8');
const js = readFileSync('dist/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const html = `<title>VLUX Loyalty</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Prototipo interactivo de VLUX Loyalty: tarjeta de sellos digital con vistas de cliente, empleado y dueño.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Young+Serif&display=swap">
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`;
writeFileSync('dist/index.html', html);
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
