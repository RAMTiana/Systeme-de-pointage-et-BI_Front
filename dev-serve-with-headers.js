/*
Simple static server for local testing that adds security headers
Usage:
  npm install express serve-static
  node dev-serve-with-headers.js [static_dir] [port]
Default static_dir: dist/srb-frontend/browser
Default port: 4200
*/

const express = require('express');
const path = require('path');

const app = express();
const staticDir = process.argv[2] || path.join(__dirname, 'dist', 'srb-frontend', 'browser');
const port = parseInt(process.argv[3] || process.env.PORT || '4200', 10);

// Add headers to allow opener <-> popup postMessage communication
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  // Don't set COEP here unless you intentionally need cross-origin isolation.
  next();
});

app.use(express.static(staticDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Serving ${staticDir} on http://localhost:${port} with COOP header`);
});
