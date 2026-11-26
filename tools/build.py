"""Render the complete offline-readable integration atlas using Python 3."""
import hashlib
import json
import random
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

OUT = Path('docs')
rows = json.loads(Path('catalog.json').read_text())['integrations']
known = {r['domain'] for r in rows}
layouts = set()


def esc(text):
    return escape(str(text), quote=True)


def label(value):
    return value.replace('_', ' ').capitalize()


def external(text, url):
    if not url or urlsplit(url).scheme not in ('https', 'http'):
        return ''
    return f'<a href="{esc(url)}">{esc(text)} ↗</a>'


def shell(title, content, base='', style=''):
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} · Integration Atlas</title><link rel="stylesheet" href="{base}atlas.css"><script defer src="{base}atlas.js"></script></head><body style="{style}"><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="{base}index.html"><i aria-hidden="true">⌂</i> Integration Atlas</a><a href="{base}index.html#directory">Directory ↗</a></header><main id="main">{content}</main><footer>Independent Home Assistant integration reference · <a href="{base}credits.html">Sources &amp; attribution</a></footer></body></html>'''


def chips(values):
    return '<ul class="chips">' + ''.join(f'<li>{esc(label(v))}</li>' for v in values) + '</ul>'


def guide(r):
    domain, name = r['domain'], esc(r['name'])
    rng = random.Random(domain)
    kind = label(r.get('integration_type', 'integration'))
    article = r.get('article') or r.get('documentation')
    summary = r.get('summary') or (f"Use {r['supported_by']} to connect this brand." if r.get('supported_by') else f"Explore {r['name']} setup, capabilities and implementation details.")
    parent = r.get('supported_by')
    if parent in known:
        setup = f'This brand uses <a href="../{parent}/">{esc(parent)}</a>. Open that guide to set up its supporting integration.'
    elif r.get('config_flow'):
        setup = f'Open <strong>Settings → Devices &amp; services</strong>. Use <strong>Add integration</strong> (or <strong>Create helper</strong> for a helper) and search for {name}.'
    else:
        setup = f'Consult the maintainer reference below for the configuration method and prerequisites for {name}.'
    steps = ''.join(f'<details><summary>{esc(label(step))}</summary><p>{esc(", ".join(label(f) for f in fields))}</p></details>' for step, fields in r.get('steps', {}).items() if fields)
    platforms = r.get('platforms', [])
    actions = r.get('actions', [])
    topics = r.get('topics', [])
    references = [external('Maintainer documentation', article)]
    if r.get('documentation') != article:
        references.append(external('Component documentation', r.get('documentation')))
    references.extend(external(k + ' source', v) for k,v in r['sources'].items())
    connection = label(r.get('iot_class', 'unspecified'))
    explanations = {'local_push':'Updates originate on your local network as state changes.', 'local_polling':'Home Assistant periodically requests fresh state over your local network.', 'cloud_push':'Updates arrive from a remote service as state changes.', 'cloud_polling':'Home Assistant periodically requests fresh state from a remote service.', 'calculated':'Values are calculated within Home Assistant.'}
    blocks = [
        ('Setup', setup + steps),
        ('Connection', '<strong>'+esc(connection)+'</strong><p>'+esc(explanations.get(r.get('iot_class'), 'See the maintainer reference for connection requirements.'))+'</p>'+chips(r.get('connectivity', []))),
        ('Capabilities', ('Entity platforms in the Material source tree.' + chips(platforms) if platforms else f'Explore the supported uses of {name} in the references below.') + (f'<details><summary>{len(actions)} documented actions</summary>'+chips(actions)+'</details>' if actions else '')),
        ('Reading guide', ('<ul>'+''.join('<li>'+esc(t)+'</li>' for t in topics)+'</ul>' if topics else 'Start with the setup notes and consult the sources for supported models and version details.') + ('<p>'+external('Read the guide', article)+'</p>' if article else '')),
        ('Setup checklist', ''.join(f'<label><input type="checkbox" data-save="{domain}-{i}"> {text}</label>' for i,text in enumerate(['Read the setup requirements','Review available capabilities','Verify setup in my home']))),
        ('References', '<ul>'+''.join('<li>'+v+'</li>' for v in references if v)+'</ul>'),
    ]
    # Keep setup near the top. Pair the six sections on a twelve-column grid.
    # Reject collisions so two integrations never share the same structural layout.
    while True:
        order = list(range(1,6))
        rng.shuffle(order)
        order.insert(rng.randrange(2),0)
        widths = []
        for _ in range(3):
            w = rng.randrange(4,9)
            widths.extend([w,12-w])
        signature = (tuple(order),tuple(widths))
        if signature not in layouts:
            layouts.add(signature)
            break
    panels = ''.join(f'<section class="panel tone{j}" style="--span:{w}"><h2>{blocks[j][0]}</h2><div>{blocks[j][1]}</div></section>' for j,w in zip(order,widths))
    hue = int(hashlib.sha256(domain.encode()).hexdigest()[:6],16)%360
    body = f'<nav><a href="../../index.html#directory">Directory</a> / {name}</nav><div class="hero"><small>{esc(kind)}</small><h1>{name}</h1><p>{esc(summary)}</p><code>{esc(domain)}</code></div><div class="grid">{panels}</div>'
    dest = OUT/'integrations'/domain
    dest.mkdir(parents=True, exist_ok=True)
    (dest/'index.html').write_text(shell(r['name'],body,'../../',f'--h:{hue}'))


for row in rows:
    guide(row)
entries = []
for r in sorted(rows,key=lambda r:r['name'].casefold()):
    domain=r['domain']
    tags=' '.join(r['sources']) or 'Article'
    entries.append(f'<li data-origin="{tags}"><a href="integrations/{domain}/"><b>{esc(r["name"])}</b><code>{esc(domain)}</code><span>{tags} ↗</span></a></li>')
directory = '<ol id="entries">'+''.join(entries)+'</ol>'
intro = f'<div class="hero"><small>Home Assistant field guide</small><h1>Integration Atlas</h1><p>Find setup instructions, supported capabilities and maintainer references for {len(rows):,} integrations.</p></div>'
controls = '<div class="filters" hidden><label>Find an integration<input type="search" id="search" placeholder="Name or domain" autocomplete="off"></label><label>Collection<select id="collection"><option value="">All collections</option><option>Stock</option><option>Material</option><option>Package</option><option>Article</option></select></label></div><p id="matches" aria-live="polite"></p>'
(OUT/'index.html').write_text(shell('Directory',intro+'<section id="directory"><h2>Browse integrations</h2>'+controls+directory+'</section>'))
(OUT/'credits.html').write_text(shell('Sources','<h1>Sources &amp; attribution</h1><p>Descriptions and topic lists adapted from <a href="https://github.com/home-assistant/home-assistant.io">Home Assistant Documentation</a> by its contributors are distributed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>. Each article links to the original guide. Component and package metadata comes from the linked project manifests. Checklists are stored on this device.</p>'))
print(f'{len(rows)} guides, {len(layouts)} distinct section layouts')
