"""Render the complete offline-readable integration atlas using Python 3."""
from references import render_reference
from navigation import recommendations
from stories import design, marketing, instrument
import hashlib
import json
import random
from html import escape
from pathlib import Path


OUT = Path('docs')
rows = json.loads(Path('catalog.json').read_text())['integrations']
known = {r['domain'] for r in rows}
layouts = set()
related = recommendations(rows)


def esc(text):
    return escape(str(text), quote=True)


def label(value):
    return value.replace('_', ' ').capitalize()


def shell(title, content, base='', style='', theme='folio', article_search=False):
    search_assets = (
        f'<link rel="stylesheet" href="{base}article-find.css">'
        f'<script defer src="{base}article-find.js"></script>'
        if article_search else ''
    )
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} · Integration Atlas</title><link rel="stylesheet" href="{base}atlas.css"><script defer src="{base}atlas.js"></script><link rel="stylesheet" href="{base}settings.css"><link rel="stylesheet" href="{base}search.css"><script src="{base}settings.js" defer></script><script src="{base}search.js" defer></script><link rel="stylesheet" href="{base}workspace.css"><link rel="stylesheet" href="{base}tour.css"><script defer src="{base}workspace.js"></script><script defer src="{base}tour.js"></script>{search_assets}</head><body style="{style}" data-theme="{theme}"><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="{base}index.html"><i aria-hidden="true">⌂</i> Integration Atlas</a><form class="global-search" action="{base}directory.html"><label><span class="sr-only">Search integrations</span><input name="q" type="search" placeholder="Find an integration" aria-label="Find an integration"></label></form><a href="{base}directory.html">Directory</a><button id="workspace-open" type="button">Workspace</button><button id="reader-settings" type="button">Settings</button></header><main id="main">{content}</main><footer>Independent Home Assistant integration reference · <a href="{base}credits.html">Sources &amp; attribution</a> · <a href="{base}downloads.html">Offline guide</a> · <button id="tour-open">Guided tour</button> <button id="access-open">Accessibility</button></footer></body></html>'''


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
    reader = f'../../references/{domain}/'
    references = [f'<a href="{reader}">Read the local reference</a>']
    connection = label(r.get('iot_class', 'unspecified'))
    explanations = {'local_push':'Updates originate on your local network as state changes.', 'local_polling':'Home Assistant periodically requests fresh state over your local network.', 'cloud_push':'Updates arrive from a remote service as state changes.', 'cloud_polling':'Home Assistant periodically requests fresh state from a remote service.', 'calculated':'Values are calculated within Home Assistant.'}
    blocks = [
        ('Setup', setup + steps),
        ('Connection', '<strong>'+esc(connection)+'</strong><p>'+esc(explanations.get(r.get('iot_class'), 'See the maintainer reference for connection requirements.'))+'</p>'+chips(r.get('connectivity', []))),
        ('Capabilities', ('Entity platforms in the Material source tree.' + chips(platforms) if platforms else f'Explore the supported uses of {name} in the references below.') + (f'<details><summary>{len(actions)} documented actions</summary>'+chips(actions)+'</details>' if actions else '')),
        ('Reading guide', ('<ul>'+''.join('<li>'+esc(t)+'</li>' for t in topics)+'</ul>' if topics else 'Start with the setup notes and consult the sources for supported models and version details.') + ('<p>'+f'<a href="{reader}">Read the reference →</a>'+'</p>' if article else '')),
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
    copy = design(r)
    theme = copy['theme']
    panels = ''.join(f'<section id="section-{j}" class="panel tone{j}" style="--span:{w}"><h2>{blocks[j][0]}</h2><div>{blocks[j][1]}</div></section>' for j,w in zip(order,widths))
    hue = int(hashlib.sha256(domain.encode()).hexdigest()[:6],16)%360
    overview = f'../../discover/{domain}/'
    art = instrument(r,theme,copy.get('flow'))
    context = ''.join(f'<section><h3>{esc(heading)}</h3><p>{esc(paragraph)}</p></section>' for heading,paragraph in r.get('article_text',[]))
    reading = f'<article class="reading"><h2>Using {name}</h2>{context}</article>' if context else ''
    body = f'<nav><a href="../../directory.html">Directory</a> / <a href="{overview}">{name}</a> / Guide</nav><div class="hero campaign composition-{rng.randrange(4)}"><div><small>{esc(kind)} guide</small><h1>{name}</h1><p>{esc(summary)}</p><code>{esc(domain)}</code></div>{art}</div><div id="setup" class="grid">{panels}</div>{reading}{related[domain]}'
    dest = OUT/'integrations'/domain
    dest.mkdir(parents=True, exist_ok=True)
    color = f'--h:{hue}'
    (dest/'index.html').write_text(shell(r['name'] + ' guide',body,'../../',color,theme,article_search=True))
    dest, landing = marketing(r,copy,f'../../integrations/{domain}/')
    (dest/'index.html').write_text(shell(r['name'],landing,'../../',color,theme))
    render_reference(r,shell,theme,color)


for row in rows:
    guide(row)
entries = []
for r in sorted(rows,key=lambda r:r['name'].casefold()):
    domain=r['domain']
    tags=' '.join(r['sources']) or 'Article'
    entries.append(f'<li data-origin="{tags}"><a href="discover/{domain}/"><b>{esc(r["name"])}</b><code>{esc(domain)}</code><span>{tags} ↗</span></a></li>')
directory = '<ol id="entries">'+''.join(entries)+'</ol>'
intro = f'<div class="hero"><small>Home Assistant field guide</small><h1>Integration Atlas</h1><p>Find setup instructions, supported capabilities and maintainer references for {len(rows):,} integrations.</p></div>'
controls = '<div class="filters" hidden><label>Find an integration<input type="search" id="search" placeholder="Name or domain" autocomplete="off"></label><label>Collection<select id="collection"><option value="">All collections</option><option>Stock</option><option>Material</option><option>Package</option><option>Article</option></select></label></div><p id="matches" aria-live="polite"></p>'
(OUT/'directory.html').write_text(shell('Directory',intro+'<section id="directory"><h2>Browse integrations</h2>'+controls+directory+'</section>'))
(OUT/'credits.html').write_text(shell('Sources','<h1>Sources &amp; attribution</h1><p>Descriptions and topic lists adapted from Home Assistant Documentation (github.com/home-assistant/home-assistant.io) by its contributors are distributed under <a href="article-license.html">CC BY-NC-SA 4.0</a>. Each local reference identifies its sources. Component and package metadata comes from the linked project manifests. Checklists are stored on this device.</p>'))
print(f'{len(rows)} guides, {len(layouts)} distinct section layouts')

stories = [('hue','Light a room','studio'),('sun','Follow the sun','almanac'),('printer_door','Watch a print','console'),('bin_day','Plan collection day','almanac'),('mqtt','Connect a message bus','signal')]
features = ''.join(f'<a class="feature-card {family}" href="discover/{domain}/"><small>{esc(domain.replace("_"," ").title())}</small><h2>{title}</h2><span>Explore →</span></a>' for domain,title,family in stories)
home = f'<section class="hero directory-hero"><div><small>Home Assistant integrations</small><h1>A home in sync.</h1><p>Explore what your lights, sensors and everyday devices can do together.</p><a class="cta" href="directory.html">Explore {len(rows):,} integrations →</a></div></section><section class="featured"><h2>Explore by story</h2><div class="feature-grid">{features}</div></section>'
(OUT/'index.html').write_text(shell('Home',home))

(OUT/'article-license.html').write_text(shell('Article license','<h1>Article license</h1><pre style="white-space:pre-wrap">'+esc(Path('ARTICLE-LICENSE.md').read_text())+'</pre>'))

(OUT/'lookup.json').write_text(json.dumps([[r['domain'],r['name']] for r in rows],ensure_ascii=False))
