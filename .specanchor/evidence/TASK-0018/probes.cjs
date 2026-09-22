// Offline audit probes. Passing assertions reproduce defects; they do not accept them.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const root = path.resolve(__dirname, '../../..');
const { VisualSearchAgent } = require(path.join(root, 'packages/consultation/src/agents/image-scout.ts'));
const { ResearchAgent } = require(path.join(root, 'packages/consultation/src/agents/researcher.ts'));
const { OrchestratorAgent } = require(path.join(root, 'packages/consultation/src/agents/orchestrator.ts'));
const { VisualCreatorAgent } = require(path.join(root, 'packages/consultation/src/agents/creator.ts'));
const observations = [];
function record(id, detail) { observations.push({ id, detail }); }
async function main() {
  global.fetch = async () => { throw new Error('Network prohibited in audit probes'); };
  const scout = new VisualSearchAgent();
  const wrong = scout.scoutReferenceImages({ userInput: 'Escudo del Real Madrid' });
  assert.equal(wrong.entitiesFound[0].query, 'Valencia CF escudo');
  record('ARQ-01', 'Real Madrid crest request returns Valencia CF reference without network access.');
  const researcher = new ResearchAgent();
  const base = { userInput: 'Mare de Déu y Senyera', existingSlots: {}, questionsAsked: 0 };
  const a = researcher.analyzeAndInvestigate({ ...base, references: [{source:'https://example.invalid/a.png', mimeType:'image/png', label:'A'}] });
  const b = researcher.analyzeAndInvestigate({ ...base, references: [{source:'https://example.invalid/b.png', mimeType:'image/png', label:'B'}] });
  assert.equal(a.dossier.masterDiffusionPrompt, b.dossier.masterDiffusionPrompt);
  record('ARQ-02', 'Changing reference pixels/URL and label does not change the generation prompt; no image is fetched.');
  assert.equal(a.decision, 'complete');
  assert.equal(a.dossier.anatomicalPlacement.bodyPart, 'inner_forearm');
  record('ARQ-03', 'Two motifs complete immediately despite unspecified placement/style/colour; right inner forearm is invented.');
  const o = new OrchestratorAgent();
  let s = o.createSession('offline-audit');
  for (const text of ['Un león', 'En el antebrazo izquierdo', 'Línea fina', 'Solo negro']) {
    s = o.handleUserInteraction(s, text);
  }
  assert.ok(s.questionsAsked <= 3);
  assert.equal(s.phase, 'ready_to_generate');
  assert.equal(s.dossier.masterDiffusionPrompt.includes('león'), false);
  record('ARQ-03-history', { questionsAsked:s.questionsAsked, finalSubject:s.dossier.subjectTitle, lostInitialSubject:true });
  const artifact = await new VisualCreatorAgent().generateTattoo({ dossier:a.dossier });
  assert.equal(artifact.stencil.url, artifact.mockup.url);
  assert.equal(artifact.stencil.provider, 'thermal-stencil-engine-1:1');
  record('ARQ-04', 'No credentials: same generic SVG returned as mockup and thermal stencil, without an error.');
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({url, body:JSON.parse(init.body)});
    return {ok:true, json:async () => ({ images:[{url:'https://example.invalid/result.png'}] })};
  };
  await new VisualCreatorAgent().generateTattoo({ dossier:a.dossier, falKey:'offline-placeholder' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.image_url, undefined);
  assert.equal(calls[1].body.strength, 0.78);
  record('ARQ-05', 'Mocked provider confirms text-only master generation, then generative image-to-image stencil with strength 0.78.');
  const large = researcher.analyzeAndInvestigate({ ...base, existingSlots:{size:{widthMm:200,heightMm:300}} });
  assert.equal(a.dossier.masterDiffusionPrompt, large.dossier.masterDiffusionPrompt);
  assert.equal('size' in large.dossier, false);
  record('ARQ-06', 'Physical dimensions do not survive into dossier or master generation prompt.');
  fs.writeFileSync(path.join(__dirname, 'probe-results.json'), JSON.stringify(observations, null, 2)+'\n');
  console.log(JSON.stringify(observations, null, 2));
}
main().catch(error => { console.error(error); process.exitCode=1; });
