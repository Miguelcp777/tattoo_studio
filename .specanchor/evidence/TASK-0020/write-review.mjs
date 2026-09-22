import { readFile, writeFile } from 'node:fs/promises';
const review = JSON.parse(await readFile('.specanchor/evidence/TASK-0019/impact-review.json', 'utf8'));
review.task_spec = '.specanchor/tasks/TASK-0020.spec.md';
const added = [
  'apps/web/src/components/ImageDetail.tsx', 'apps/web/src/components/GenerationProgress.tsx',
  'apps/web/src/lib/reference-bytes.test.ts',
];
for (const path of added) if (!review.files.some((file) => file.path === path)) {
  review.files.push({ path, kind: path.endsWith('.test.ts') ? 'behavior_preserving' : 'contract',
    specs: ['.specanchor/modules/web.spec.md'], rationale: 'TASK-0020 progress, detail inspection and official reference rasterization.',
    evidence: ['.specanchor/evidence/TASK-0020/verification.md'] });
}
review.traceability = [1,2,3,4].map((id) => ({
  requirement: `TASK-0020/REQ-00${id}`, acceptance: `TASK-0020/AC-00${id}`,
  verification: 'Automated checks and rendered observations detailed in verification.md',
  result: id === 4 ? 'not_run' : 'pass', evidence: '.specanchor/evidence/TASK-0020/verification.md',
}));
review.scope_note = 'Rows inherited from TASK-0019 describe preserved pre-existing working-tree changes, not new authorship. Original exact-stencil target remains open. TASK-0020 visual hyperrealism acceptance is pending.';
review.semantic_alignment = { code_to_spec: 'PARTIAL', spec_to_code: 'PARTIAL' };
await writeFile('.specanchor/evidence/TASK-0020/impact-review.json', JSON.stringify(review, null, 2) + '\n');
