"""Check that each catalog record has its promised public surfaces."""
import json
from html.parser import HTMLParser
from pathlib import Path

class Structure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sections = []
        self.main = False
        self.h1s = 0
        self.controls = set()

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        self.main |= tag == 'main'
        self.h1s += tag == 'h1'
        if 'tone' in data.get('class','') and tag == 'section':
            self.sections.append((data.get('id'),data.get('style')))
        if data.get('id'):
            self.controls.add(data['id'])

def check():
    root = Path('docs')
    catalog = json.loads(Path('catalog.json').read_text())['integrations']
    domains = {r['domain'] for r in catalog}
    assert len(domains) == len(catalog)
    reviewed = set()
    for path in Path('editorial').glob('*.json'):
        row = json.loads(path.read_text())
        assert path.stem in domains, path
        assert row['theme'] in {'studio','almanac','console','gallery','workshop','observatory','signal','folio'}, path
        assert isinstance(row['highlights'], list) and len(row['highlights']) == 3, path
        fields = [row['headline'],row['intro'],*row['highlights']]
        if 'flow' in row:
            flow = row['flow']
            assert isinstance(flow['stages'], list) and 2 <= len(flow['stages']) <= 4, path
            fields.extend([flow['title'],*flow['stages']])
        assert all(isinstance(value,str) and value.strip() for value in fields), path
        reviewed.add(path.stem)
    layouts = set()
    for area in ('discover','integrations','references'):
        actual = {p.parent.name for p in (root/area).glob('*/index.html')}
        assert actual == domains, (area, actual ^ domains)
    for domain in domains:
        for area in ('discover','integrations','references'):
            path = root/area/domain/'index.html'
            doc = Structure()
            doc.feed(path.read_text())
            assert doc.main and doc.h1s >= 1, path
            assert {'workspace-open','reader-settings','access-open','tour-open'} <= doc.controls, path
            if area == 'integrations':
                layout = tuple(doc.sections)
                assert len(layout) == 6 and layout not in layouts, path
                layouts.add(layout)
    assert {d for d,_ in json.loads((root/'lookup.json').read_text())} == domains
    print(f'{len(domains)} domains matched, {len(layouts)} distinct guide layouts, reader controls present on every integration route; {len(reviewed)} individually edited campaigns')

if __name__ == '__main__':
    check()
