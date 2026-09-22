"""One explicit edit of the prior public-reference QA proposal, never the user's session."""
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
report_path = root / '.specanchor/evidence/TASK-0021/live-result.json'
if '--after-test-isolation-fix' in sys.argv:
    report_path = report_path.with_name('live-result-after-isolation-fix.json')
if report_path.exists() and '--collect-only' not in sys.argv:
    raise SystemExit('Existing run recorded; no automatic retry.')
original = json.loads((root / '.specanchor/evidence/TASK-0020/live-result.json').read_text())
settings = load_settings()
with sqlite3.connect('file:.artifacts/studio/jobs.sqlite?mode=ro', uri=True) as db:
    row = db.execute("SELECT id,owner FROM jobs WHERE json_extract(result,'$.designId')=?",
                     (original['designId'],)).fetchone()
assert row and settings.worker_token
headers = {'Authorization': 'Bearer ' + settings.worker_token.get_secret_value(), 'X-Session-Id': row[1]}
report = {'publicQaOnly': True, 'state': 'started', 'automaticRetries': 0}
report_path.write_text(json.dumps(report, indent=2))
with httpx2.Client(base_url='http://127.0.0.1:8100/studio', headers=headers, timeout=30) as client:
    if '--collect-only' in sys.argv:
        with sqlite3.connect('file:.artifacts/studio/jobs.sqlite?mode=ro', uri=True) as db:
            existing = db.execute("SELECT id FROM jobs WHERE owner=? AND json_extract(payload,'$.edit.parentJobId')=? ORDER BY created DESC LIMIT 1", (row[1], row[0])).fetchone()
        assert existing
        response = client.get('/jobs/' + existing[0])
    else:
        response = client.post('/jobs', json={'idempotencyKey': str(uuid.uuid4()),
            'edit': {'parentJobId': row[0], 'instruction': 'Haz el escudo del Valencia CF un poco más pequeño. Conserva la Virgen, la Senyera y el resto de la composición.'}})
    response.raise_for_status()
    job = response.json()
    deadline = time.monotonic() + 600
    while job['state'] in ('queued', 'running') and time.monotonic() < deadline:
        time.sleep(5)
        response = client.get('/jobs/' + job['jobId'])
        response.raise_for_status()
        job = response.json()
    report['state'] = job['state']
    if job['result']:
        result = job['result']
        report.update({'designId': result['designId'], 'edit': result['edit'],
                       'briefRevision': result['briefRevision']})
        output = Path('.artifacts/qa-task0021')
        output.mkdir(exist_ok=True)
        for name in ('master', 'mockup'):
            data = client.get('/media/' + result[name]['assetId'])
            data.raise_for_status()
            (output / (name + '.png')).write_bytes(data.content)
        assert result['master']['designId'] == result['stencil']['designId'] == result['mockup']['designId']
        report['previousStillAvailable'] = client.get('/jobs/' + row[0]).json()['state'] == 'succeeded'
        report['sharedIdentity'] = True
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps(report, ensure_ascii=False))
