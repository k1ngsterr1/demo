#!/usr/bin/env python3
"""Package source plus an explicit list of verified evidence; exclude local state/builds."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--evidence-list', type=Path, required=True)
args = parser.parse_args()
output = args.output.resolve()
if output.exists():
    parser.error('Archive already exists; choose a new output to preserve the previous delivery')

excluded = {'node_modules', '.expo', 'build', 'dist', 'coverage', '__pycache__', '.DS_Store', 'Runner.xcodeproj'}
files = [root / name for name in ['package.json', 'README.md', '.gitignore']]
for folder in ['client', 'kit', 'scripts', 'docs']:
    for item in (root / folder).rglob('*'):
        relative = item.relative_to(root)
        if not item.is_file() or any(part in excluded for part in relative.parts):
            continue
        if relative.parts[:2] in [('client', 'ios'), ('client', 'android'), ('docs', 'archive')]:
            continue
        if item.name.startswith('.mock-state.json') or item.name == 'oversize.csv':
            continue
        # Historical acceptance reports are retained locally, not mixed into the final handoff.
        if folder == 'docs' and item.name in ['CUA_ACCEPTANCE_2026-10-30.md', 'ANDROID_R8.md']:
            continue
        files.append(item)
for name in json.loads(args.evidence_list.read_text()):
    item = root / name
    if item.is_symlink() or not item.is_file() or not item.resolve().is_relative_to(root):
        raise ValueError(f'Invalid evidence path: {name}')
    files.append(item)
files = sorted(set(files))
manifest = {}
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for item in files:
        relative = str(item.relative_to(root))
        digest = hashlib.sha256()
        with item.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(chunk)
        manifest[relative] = {'bytes': item.stat().st_size, 'sha256': digest.hexdigest()}
        archive.write(item, 'mobile-engineer/' + relative)
    archive.writestr('mobile-engineer/SUBMISSION_MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2))
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise RuntimeError('Archive integrity check failed')
print(json.dumps({'archive': str(output), 'files': len(files), 'bytes': output.stat().st_size}, ensure_ascii=False))
