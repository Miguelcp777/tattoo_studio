"""Recompose the prior public QA master through the real owned worker endpoint."""
import json
import sqlite3
import sys
import time
import uuid
from pathlib import Path

import httpx2

sys.path.insert(0, str(Path.cwd()))
from app.settings import load_settings

root = Path.cwd().parents[1]
report_file = root / '.specanchor/evidence/TASK-0022/live-result.json'
if report_file.exists():
    raise SystemExit('Already recorded; no automatic repeat.')
previous = json.loads((root / '.specanchor/evidence/TASK-0021/live-result-after-isolation-fix.json').read_text())
with sqlite3.connect('file:.artifacts/studio/jobs.sqlite?mode=ro', uri=True) as db:
    row = db.execute("SELECT id,owner,result FROM jobs WHERE json_extract(result,'$.designId')=? AND state='succeeded' ORDER BY created LIMIT 1", (previous['designId'],)).fetchone()
assert row
parent = json.loads(row[2])
assert parent.get('background'), 'This check must not generate a new background.'
settings = load_settings()
assert settings.worker_token
headers = {'Authorization': 'Bearer ' + settings.worker_token.get_secret_value(), 'X-Session-Id': row[1]}
with httpx2.Client(base_url='http://127.0.0.1:8100/studio', headers=headers, timeout=30) as client:
    response = client.post('/jobs', json={'idempotencyKey': str(uuid.uuid4()), 'edit': {
        'parentJobId': row[0], 'instruction': 'es muy pequeño, quiero que me ocupe casi todo el gemelo y abarque hacia los lados, casi envolviendo el gemelo'}})
    response.raise_for_status()
    job = response.json()
    deadline = time.monotonic() + 45
    while job['state'] in ('queued', 'running') and time.monotonic() < deadline:
        time.sleep(1)
        response = client.get('/jobs/' + job['jobId'])
        response.raise_for_status()
        job = response.json()
    assert job['state'] == 'succeeded', job['error']
    result = job['result']
    unchanged = all(result[name] == parent[name] for name in ('master','stencil','stencilMirror','pdf','pdfMirror','background'))
    assert unchanged
    assert result['transform']['heightPx'] > parent['transform']['heightPx']
    output = Path('.artifacts/qa-task0022')
    output.mkdir(exist_ok=True)
    for name, artifact in [('before', parent), ('after', result)]:
        response = client.get('/media/' + artifact['mockup']['assetId'])
        response.raise_for_status()
        (output / (name + '.png')).write_bytes(response.content)
    report = {'state':'succeeded', 'sameArtworkStencilAndBackground':unchanged,
              'before':parent['transform'], 'after':result['transform'], 'size':result['size']}
    report_file.write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
