#!/usr/bin/env python3
"""Documentary coverage guard, not a semantic validator. Python >=3.10 and Git."""
import argparse, fnmatch, json, subprocess, sys
from pathlib import Path

def git(root, *args):
    p = subprocess.run(['git', *args], cwd=root, capture_output=True)
    if p.returncode: raise ValueError(p.stderr.decode(errors='replace').strip())
    return p.stdout.decode('utf-8', errors='surrogateescape')

def safe(root, value):
    if not isinstance(value, str) or not value: raise ValueError('Expected relative path')
    p = (root / value).resolve()
    if not p.is_relative_to(root): raise ValueError('Path outside repository: ' + value)
    return p

def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def match(p, patterns): return any(fnmatch.fnmatchcase(p, x) for x in patterns)
def paths(root, *args): return set(filter(None, git(root, *args).split('\0')))

def run(a):
    root = Path(git(Path.cwd(), 'rev-parse', '--show-toplevel').strip()).resolve()
    c = read(safe(root, a.config))
    if set(c) != {'version','spec_root','module_map','material_paths','exclude_paths'} or c['version'] != 2:
        raise ValueError('Unsupported configuration keys/version')
    for key in ('material_paths','exclude_paths'):
        if not isinstance(c[key], list) or not all(isinstance(x,str) and x for x in c[key]): raise ValueError('Invalid patterns')
    sr = safe(root,c['spec_root'])
    data = read(safe(root,c['module_map']))
    modules = data['modules']
    if not isinstance(modules,list) or not modules: raise ValueError('Empty module map')
    names=set()
    for m in modules:
        if not isinstance(m['name'],str) or not m['name'] or m['name'] in names: raise ValueError('Invalid/duplicate module name')
        names.add(m['name'])
        if not isinstance(m['paths'],list) or not m['paths'] or not all(isinstance(x,str) and x for x in m['paths']): raise ValueError('Invalid module patterns')
        if not safe(root,m['spec']).is_file(): raise ValueError('Missing module spec: '+m['spec'])
    globals=data.get('global_spec_paths',[])
    if not isinstance(globals,list) or not all(isinstance(x,str) for x in globals): raise ValueError('Invalid global patterns')
    specs={m['spec'] for m in modules}
    def spec(p): return p in specs or match(p,globals) or p.startswith(c['spec_root'].rstrip('/')+'/modules/')
    def material(p): return not spec(p) and match(p,c['material_paths']) and not match(p,c['exclude_paths'])
    def anchors(p): return {m['spec'] for m in modules if match(p,m['paths'])}
    head=git(root,'rev-parse','HEAD').strip()
    if a.baseline:
        inventory=paths(root,'ls-files','-z','--cached','--others','--exclude-standard')
        source=sorted(p for p in inventory if material(p))
        unmapped=[p for p in source if not anchors(p)]
        report={'revision':head,'material_files':source,'unmapped':unmapped,'functional_validation':'NOT_RUN'}
        out=sr/'evidence/baseline.json';out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(report,indent=2));return int(bool(unmapped))
    changed=set()
    if a.base:
        base=git(root,'merge-base',a.base,'HEAD').strip()
        changed=paths(root,'diff','--name-only','-z','--no-renames',base,'HEAD')
    changed |= paths(root,'diff','--name-only','-z','--no-renames','HEAD')
    changed |= paths(root,'ls-files','--others','--exclude-standard','-z')
    relevant={p for p in changed if spec(p) or material(p)}
    errors=[]
    for p in sorted(relevant):
        if material(p) and not anchors(p): errors.append('Unmapped material file: '+p)
        if spec(p) and p not in specs and not match(p,globals): errors.append('Unmapped module spec: '+p)
    if relevant and not a.review: errors.append('Provide --review for changed material/spec files')
    if a.review:
        r=read(safe(root,a.review))
        if r.get('revision')!=head: errors.append('Review revision must match HEAD')
        if not safe(root,r.get('task_spec')).is_file(): errors.append('Missing task spec')
        rows=r.get('files',[]); indexed={x['path']:x for x in rows}
        if len(indexed)!=len(rows): errors.append('Duplicate reviewed paths')
        for p in sorted(relevant):
            row=indexed.get(p)
            if row is None: errors.append('Missing impact review: '+p);continue
            kind=row.get('kind')
            allowed={'requirement','clarification','correction'} if spec(p) else {'contract','behavior_preserving'}
            if kind not in allowed or not row.get('rationale','').strip(): errors.append('Invalid classification/rationale: '+p)
            if material(p):
                if not anchors(p).issubset(set(row.get('specs',[]))): errors.append('Missing affected anchors: '+p)
                if kind=='contract' and not anchors(p).issubset(changed): errors.append('Contract needs changed module specs: '+p)
            if not row.get('evidence'): errors.append('Missing evidence: '+p)
            for ref in row.get('evidence',[]):
                if not safe(root,ref.split('#')[0]).is_file(): errors.append('Missing evidence file: '+ref)
        trace=r.get('traceability',[])
        if any(x.get('kind') in {'contract','requirement'} for x in rows) and not trace: errors.append('Missing traceability')
        for t in trace:
            if not all(t.get(k) for k in ('requirement','acceptance','verification','evidence')): errors.append('Incomplete traceability')
            elif not safe(root,t['evidence'].split('#')[0]).is_file(): errors.append('Missing trace evidence')
            if t.get('result')!='pass': errors.append('Affected acceptance criterion not passing')
    for e in errors: print('ERROR: '+e)
    print('Documentary coverage: '+('FAIL' if errors else 'PASS'))
    print('Semantic alignment is NOT checked. Review the actual diff and evidence.')
    if not relevant: print('No relevant changes; use --base <target-ref> for committed branch changes.')
    return int(bool(errors))

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config',default='anchor.yaml');ap.add_argument('--base')
    ap.add_argument('--baseline',action='store_true');ap.add_argument('--review')
    a=ap.parse_args()
    if a.baseline and (a.base or a.review): ap.error('Baseline is a separate operation')
    try: return run(a)
    except (ValueError,KeyError,TypeError,OSError,AttributeError) as e:
        print('CONFIG/INPUT ERROR: '+str(e),file=sys.stderr);return 2
if __name__=='__main__': sys.exit(main())
