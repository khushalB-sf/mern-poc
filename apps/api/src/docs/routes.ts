import { Router, static as serveStatic } from 'express';
import swaggerUiDist from 'swagger-ui-dist';
import { buildOpenApi } from './openapi.js';

// helmet's CSP is `script-src 'self'`, so the page uses only same-origin scripts: no inline script.
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Interview Question Bank API</title>
    <link rel="stylesheet" href="/api/docs/assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs/assets/swagger-ui-bundle.js"></script>
    <script src="/api/docs/init.js"></script>
  </body>
</html>`;

const INIT = `window.ui = SwaggerUIBundle({
  url: '/api/openapi.json',
  dom_id: '#swagger-ui',
  deepLinking: true,
  tryItOutEnabled: true,
});`;

/** Mounted at /api. Public by design: it describes the contract, not any data. */
export function docsRoutes() {
  const router = Router();
  const spec = buildOpenApi();

  router.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });
  router.get('/docs', (_req, res) => {
    res.type('html').send(PAGE);
  });
  router.get('/docs/init.js', (_req, res) => {
    res.type('js').send(INIT);
  });
  router.use('/docs/assets', serveStatic(swaggerUiDist.getAbsoluteFSPath()));
  return router;
}
