// One bounded public-reference run through the real BFF. No private uploads or implicit retries.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const base = 'http://127.0.0.1:3100';
let cookie = '';
async function request(path, body) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}
const root = resolve('services/worker/.artifacts/qa-task0020');
await mkdir(root, { recursive: true });
const report = { publicReferencesOnly: true, automaticRetries: 0, state: 'started' };
try {
  const { session } = await request('/api/consultation', {
    action: 'start',
    idea: 'Mare de Déu dels Desamparats arriba, Senyera Valenciana en el centro y escudo Valencia CF abajo. Tatuaje hiperrealista en gemelo derecho, blanco y negro con transición a color. Respeta los símbolos de las referencias y sus colores. Medidas 200 x 300 mm.',
  });
  report.references = session.references.map(({ label, source, sourcePage }) => ({ label, source, sourcePage }));
  if (session.phase !== 'ready_to_generate' || session.references.length !== 3 || session.questionsAsked !== 0)
    throw new Error('La consulta pública no quedó lista con las tres referencias.');
  console.log('Three references found automatically; submitting one live job.');
  let job = await request('/api/generate', {
    adult: true, consent: true, referencesReviewed: true, idempotencyKey: randomUUID(),
    placement: { x: 0.27, y: 0.2, width: 0.46 },
  });
  const deadline = Date.now() + 600000;
  let previous;
  while (['queued', 'running'].includes(job.state)) {
    if (job.state !== previous) console.log('Job state:', job.state);
    previous = job.state;
    if (Date.now() > deadline) throw new Error('Observation timeout; job was not retried.');
    await new Promise((done) => setTimeout(done, 5000));
    job = await request(`/api/generate?id=${job.jobId}`);
  }
  report.state = job.state;
  if (job.error) throw new Error(job.error);
  report.transform = job.result.transform;
  report.notice = job.result.notice;
  report.designId = job.result.designId;
  for (const [name, extension] of [['master', 'png'], ['mockup', 'png'], ['stencil', 'svg'], ['pdf', 'pdf']]) {
    const response = await fetch(`${base}/api/media?id=${job.result[name].assetId}`, { headers: { cookie } });
    if (!response.ok) throw new Error(`Could not read ${name}`);
    await writeFile(resolve(root, `${name}.${extension}`), Buffer.from(await response.arrayBuffer()));
  }
  console.log('Live run complete:', job.state, job.result.transform.method);
} catch (error) {
  report.state = 'failed'; report.error = error.message;
  console.log('Live run did not complete:', error.message);
  process.exitCode = 1;
} finally {
  await writeFile(resolve('.specanchor/evidence/TASK-0020/live-result.json'), JSON.stringify(report, null, 2) + '\n');
}
