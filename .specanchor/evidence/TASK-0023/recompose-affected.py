"""Local-only correction of the specific user-reported generated-anatomy result."""
import io
import json
import sqlite3
import sys
import time
import uuid
from pathlib import Path
import httpx2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path.cwd()))
from app.settings import load_settings

parent_id = '79b50cb400264c31969f113b0d063e59'
report_path = Path('../../.specanchor/evidence/TASK-0023/live-result.json')
if report_path.exists():
    raise SystemExit('Already corrected; no duplicate submission.')
with sqlite3.connect('file:.artifacts/studio/jobs.sqlite?mode=ro', uri=True) as db:
    row = db.execute("SELECT owner,result FROM jobs WHERE id=? AND state='succeeded'", (parent_id,)).fetchone()
assert row
parent = json.loads(row[1])
assert parent['backgroundKind'] == 'generated_anatomy' and parent.get('background')
settings = load_settings()
assert settings.worker_token
headers = {'Authorization':'Bearer ' + settings.worker_token.get_secret_value(), 'X-Session-Id':row[0]}
with httpx2.Client(base_url='http://127.0.0.1:8100/studio', headers=headers, timeout=30) as client:
    response = client.post('/jobs', json={'idempotencyKey':str(uuid.uuid4()), 'edit':{
        'parentJobId':parent_id, 'instruction':'Ocupar todo el gemelo con el dibujo visible, sin cambiar el diseño',
        'coverage':'full', 'mode':'placement'}})
    response.raise_for_status()
    job = response.json()
    for _ in range(40):
        if job['state'] not in ('running','queued'):
            break
        time.sleep(1)
        response = client.get('/jobs/' + job['jobId'])
        response.raise_for_status()
        job = response.json()
    assert job['state'] == 'succeeded', job.get('error')
    result = job['result']
    assert all(result[k] == parent[k] for k in ('master','stencil','stencilMirror','pdf','pdfMirror','background'))
    output = Path('.artifacts/qa-task0023')
    output.mkdir(exist_ok=True)
    response = client.get('/media/' + parent['background']['assetId']); response.raise_for_status()
    background = Image.open(io.BytesIO(response.content)).convert('RGB'); background.thumbnail((2048,2048))
    bg = np.asarray(background, dtype=np.int16)
    heights = {}
    for name, artifact in [('before',parent),('after',result)]:
        response = client.get('/media/' + artifact['mockup']['assetId']); response.raise_for_status()
        (output / (name + '.png')).write_bytes(response.content)
        pixels = np.asarray(Image.open(io.BytesIO(response.content)).convert('RGB'), dtype=np.int16)
        changed = np.abs(pixels-bg).max(axis=2)>15
        rows = np.where(changed.sum(axis=1)>5)[0]
        heights[name] = int(rows[-1]-rows[0]+1)
    report = {'state':job['state'],'jobId':job['jobId'],'printSize':result['size'],
              'sameMasterStencilBackground':True,'visiblePixelHeights':heights,'transform':result['transform']}
    report_path.write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
    assert heights['after'] > heights['before']*1.5
