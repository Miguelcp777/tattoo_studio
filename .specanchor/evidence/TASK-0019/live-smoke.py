"""One bounded live smoke run on public Commons references, no personal photographs."""
import json
import base64
import sys
import uuid
from pathlib import Path

worker = Path(__file__).resolve().parents[3] / 'services/worker'
sys.path.insert(0,str(worker))
from app.settings import load_settings
from app.studio import Studio
from generation.studio import StudioProvider

settings=load_settings()
provider=StudioProvider(settings.openai_api_key.get_secret_value(),settings.image_model,settings.vision_model)
root=worker/'.artifacts/live-smoke'
studio=Studio(root,bytes.fromhex(settings.media_key.get_secret_value()),provider)
owner=str(uuid.uuid4())
result={'personal_photos':False,'image_attempts':0,'automatic_retries':0}
try:
    candidate=json.loads((Path(__file__).parent/'live-reference.json').read_text(encoding='utf-8'))
    source=candidate['imageinfo'][0]['thumburl'].split('?')[0]
    result['reference_title']=candidate['title']
    print('Public reference found; screening and ingesting.',flush=True)
    reference=studio.ingest(owner,{'data':base64.b64encode((root/'reference.png').read_bytes()).decode(),'kind':'reference','adult':True,'consent':True})
    payload=json.loads((worker.parents[1]/'contracts/fixtures/studio-job/valid/minimal.json').read_text())
    payload['brief']['subject']['description']='Mare de Déu dels Desamparats, composición de contornos basada en la estatua de referencia.'
    payload['brief']['placement']={'bodyPart':'calf','side':'right','orientation':'vertical'}
    payload['brief']['size']={'widthMm':80,'heightMm':150}
    payload['referenceIds']=[reference['assetId']]
    payload['idempotencyKey']=str(uuid.uuid4())
    job=studio.jobs.enqueue(owner,payload)
    print('Running one reference-conditioned generation and geometric composition.',flush=True)
    result['image_attempts']=1
    studio.jobs.tick()
    finished=studio.jobs.get(owner,job['jobId'])
    result.update(state=finished['state'],error=finished['error'])
    if finished['result']:
        artifact=finished['result']
        result.update(designId=artifact['designId'],transform=artifact['transform'])
        for name in ['master','mockup','stencil','pdf']:
            extension={'master':'png','mockup':'png','stencil':'svg','pdf':'pdf'}[name]
            (root/f'{name}.{extension}').write_bytes(studio.owned(owner,artifact[name]['assetId']))
        result['output_path']=str(root)
except Exception as error:
    # Do not serialize API responses, configuration values or request bodies.
    result.update(state='failed',error_type=type(error).__name__)
    if isinstance(error,ValueError): result['error']=str(error)[:400]
finally:
    provider.close()
    (Path(__file__).parent/'live-result.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False),flush=True)
