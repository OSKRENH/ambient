"""Bundle the small text-only static app with its same-origin API proxy."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIMES = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml'}
assets = {}
for path in sorted((ROOT / 'dist').iterdir()):
    if path.is_file() and path.suffix in MIMES:
        assets['/' + path.name] = {'body': path.read_text(), 'type': MIMES[path.suffix] + '; charset=utf-8'}
assert '/index.html' in assets
output = ROOT / 'dist/server/index.js'
output.parent.mkdir(exist_ok=True)
output.write_text('const ASSETS = ' + json.dumps(assets, ensure_ascii=False) + ';\n' + (ROOT / 'server/worker.js').read_text())
print('Bundled', len(assets), 'assets with the YouTube API proxy.')
