"""Crawl all published pages without following redirects or leaving the site."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
import sys

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.targets = []
        self.ids = set()
        self.refresh = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        self.refresh |= tag == 'meta' and attrs.get('http-equiv','').lower() == 'refresh'
        for key in ('src','href','action'):
            if key in attrs:
                self.targets.append(attrs[key])

def verify():
    root = Path('docs').resolve()
    known = {}
    routes = set()
    bad = []
    for page in root.rglob('*.html'):
        parser = Links()
        parser.feed(page.read_text())
        known[page] = parser.ids
        if parser.refresh:
            bad.append((page, 'redirect'))
        for raw in parser.targets:
            url = urlsplit(raw)
            if url.scheme or url.netloc or url.path.startswith('/'):
                bad.append((page,raw))
                continue
            path = (page.parent / unquote(url.path)).resolve() if url.path else page
            if path.is_dir():
                if not url.path.endswith('/'):
                    bad.append((page,raw))
                path /= 'index.html'
            routes.add((path,url.fragment))
            if not path.is_relative_to(root) or not path.is_file():
                bad.append((page,raw))
    for target,fragment in routes:
        if fragment and fragment not in known.get(target,set()):
            bad.append((target,fragment))
    domains = [r['domain'] for r in json.loads(Path('catalog.json').read_text())['integrations']]
    for domain in domains:
        for section in ('discover','integrations','references'):
            if root/section/domain/'index.html' not in known:
                bad.append((domain,section))
    if bad:
        sys.exit(str(bad[:20]))
    print(f'{len(known)} pages, {len(domains)} complete three-page sets, zero broken or external destinations')

if __name__ == '__main__':
    verify()
