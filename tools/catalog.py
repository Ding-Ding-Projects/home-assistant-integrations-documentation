"""Collect public integration facts from four local Git checkouts."""
import argparse
import json
import re
import subprocess
from pathlib import Path

import yaml
from extract import paragraphs


def load(path):
    return json.loads(path.read_text()) if path.exists() else {}


def collect(stock, material, packages, articles):
    catalog = {}
    revisions = {}
    for label, checkout, slug, prefix in (
        ('Stock', stock, 'home-assistant/core', 'homeassistant/components'),
        ('Material', material, 'Ding-Ding-Projects/home-assistant-material', 'core/homeassistant/components'),
        ('Package', packages, 'Ding-Ding-Projects/home-assistant-integrations', 'integrations'),
    ):
        revision = subprocess.check_output(['git', '-C', checkout, 'rev-parse', 'HEAD'], text=True).strip()
        revisions[label] = revision
        for path in sorted((checkout / prefix).glob('*/manifest.json')):
            m = load(path)
            domain = m['domain']
            row = catalog.setdefault(domain, {'domain': domain, 'sources': {}})
            row.update({k: m[k] for k in ('name', 'integration_type', 'iot_class', 'config_flow', 'documentation', 'supported_by', 'categories', 'connectivity') if k in m})
            row['sources'][label] = f'https://github.com/{slug}/tree/{revision}/{prefix}/{path.parent.name}'
            if label != 'Stock':
                strings = load(path.with_name('strings.json'))
                steps = strings.get('config', {}).get('step', {})
                row['steps'] = {key: list(step.get('data', {})) for key, step in steps.items() if isinstance(step, dict)}
                platforms = 'alarm_control_panel binary_sensor button camera climate cover device_tracker event fan humidifier light lock media_player number remote scene select sensor siren switch text update vacuum valve water_heater weather'.split()
                row['platforms'] = [p for p in platforms if path.with_name(p + '.py').exists()]
                actions = strings.get('services', {})
                row['actions'] = list(actions) if isinstance(actions, dict) else []
                row['summary'] = load(path.with_name('site.json')).get('description', row.get('summary', ''))
    revisions['Articles'] = subprocess.check_output(['git', '-C', articles, 'rev-parse', 'HEAD'], text=True).strip()
    for path in sorted((articles / 'source/_integrations').glob('*.markdown')):
        if path.name.startswith('_'):
            continue
        _, header, body = path.read_text().split('---', 2)
        meta = yaml.safe_load(header)
        domain = meta.get('ha_domain') or path.stem
        row = catalog.setdefault(domain, {'domain': domain, 'sources': {}})
        row.setdefault('name', meta.get('title') or domain.replace('_', ' ').title())
        if row.get('article') and path.stem != domain:
            continue
        row['article_text'] = paragraphs(body)
        row['article'] = 'https://www.home-assistant.io/integrations/' + path.stem + '/'
        row['summary'] = str(meta.get('description') or row.get('summary') or '')
        row['topics'] = [s.strip() for s in re.findall(r'^## ([^\n]+)', body, re.M) if re.fullmatch(r"[\w /(),&'’?:.–-]{2,90}", s.strip())][:12]
    assert all(re.fullmatch(r'[a-z0-9_]+', d) for d in catalog)
    return {'revisions': revisions, 'integrations': sorted(catalog.values(), key=lambda r: r['domain'])}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('stock', 'material', 'packages', 'articles'):
        parser.add_argument(name, type=Path)
    Path('catalog.json').write_text(json.dumps(collect(**vars(parser.parse_args())), indent=2, ensure_ascii=False) + '\n')
