// Builds the module flow PDFs:  npm run flow:pdf
//   flow/src/NN-name.html  →  flow/pdf/NN-name.pdf   (one per module)
//                          →  flow/GS-HRMS-Module-Flows.pdf (all modules, with cover and contents)
// Rendering uses the local Gotenberg container (docker compose up -d gotenberg); Mermaid is bundled, so no
// internet access is needed. A diagram syntax error fails the build.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const GOTENBERG = process.env.GOTENBERG_URL ?? 'http://localhost:3002';
const only = process.argv[2]; // optional: build a single module, e.g. `npm run flow:pdf -- 08`

const template = readFileSync(join(here, 'template.html'), 'utf8');
const footer = readFileSync(join(here, 'footer.html'));
const mermaidJs = readFileSync(require.resolve('mermaid/dist/mermaid.min.js'));
const sources = readdirSync(join(here, 'src'))
  .filter((f) => /^\d\d-.+\.html$/.test(f))
  .sort();

const titleOf = (html) =>
  html
    .match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1]
    .replace(/<[^>]+>/g, '')
    .trim() ?? 'Module';
const page = (title, body) => template.replace('{{TITLE}}', title).replace('{{BODY}}', body);

async function render(html, out) {
  const form = new FormData();
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
  form.append('files', new Blob([mermaidJs], { type: 'text/javascript' }), 'mermaid.min.js');
  form.append('files', new Blob([footer], { type: 'text/html' }), 'footer.html');
  form.append('preferCssPageSize', 'true');
  form.append('printBackground', 'true');
  form.append('waitForExpression', 'window.flowReady === true');
  form.append('failOnConsoleExceptions', 'true');
  const res = await fetch(`${GOTENBERG}/forms/chromium/convert/html`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`${out}: Gotenberg ${res.status} ${await res.text()}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`  ✔ ${out.replace(`${here}/`, 'flow/')}`);
}

try {
  await fetch(`${GOTENBERG}/health`);
} catch {
  console.error(`Gotenberg is not reachable at ${GOTENBERG}. Start it with: docker compose up -d gotenberg`);
  process.exit(1);
}

mkdirSync(join(here, 'pdf'), { recursive: true });
const modules = sources.map((file) => {
  const body = readFileSync(join(here, 'src', file), 'utf8');
  return { file, body, title: titleOf(body) };
});

for (const m of modules) {
  if (only && !m.file.startsWith(only)) continue;
  await render(page(m.title, m.body), join(here, 'pdf', m.file.replace(/\.html$/, '.pdf')));
}

if (!only) {
  const today = new Date().toISOString().slice(0, 10);
  const cover = `
<section class="cover">
  <div class="kicker">Global Surf IT · Dubai &amp; Kochi</div>
  <h1>GS HRMS — Module flows</h1>
  <p class="lead">How every module works, step by step, in plain language. Based on the frontend prototype
  (gs-hrms). Use it to understand the system before building or testing the backend.</p>
  <p>Generated ${today}. Source: <code>flow/src/</code> in the backend repository.</p>
  <h2>Contents</h2>
  <ol class="toc">${modules.map((m) => `<li>${m.title}</li>`).join('')}</ol>
</section>`;
  const all = cover + modules.map((m) => m.body.replace('class="module"', 'class="module"')).join('\n');
  await render(page('GS HRMS — Module flows', all), join(here, 'GS-HRMS-Module-Flows.pdf'));
}
