"""Integration-specific editorial treatments and local task previews."""
import hashlib
from html import escape as e
import json
from pathlib import Path


def design(row):
    name = row['name']
    domain = row['domain']
    vocabulary = ' '.join([domain, name, *row.get('categories', []), *row.get('platforms', [])]).lower()
    families = [
        ('studio', ['lighting', 'light.', 'philips hue', 'led strip']),
        ('almanac', ['calendar', 'solar', 'weather', 'sunrise', 'garden', 'plant']),
        ('gallery', ['camera', 'media_player', 'music', 'television']),
        ('observatory', ['energy', 'power', 'air quality', 'temperature']),
        ('console', ['network', 'mqtt', 'router', 'server', 'printer']),
        ('workshop', ['switch', 'cover', 'vacuum', 'lock']),
        ('signal', ['binary_sensor', 'event', 'notification']),
    ]
    theme = next((t for t, keys in families if any(k in vocabulary for k in keys)), 'folio')
    article = row.get('article_text', [])
    intro = next((p for _,p in article if 50 <= len(p) <= 480), None) or row.get('summary') or f'Explore {name} in Home Assistant.'
    highlights = row.get('topics', [])[:3] or [s.replace('_', ' ').title() for s in row.get('platforms', [])[:3]]
    copy = dict(theme=theme, headline=name, intro=intro, highlights=highlights)
    override = Path('editorial',domain+'.json')
    if override.is_file():
        copy.update(json.loads(override.read_text()))
    return copy


def instrument(row, theme):
    """A reading aid. Every displayed value comes from the article or manifest."""
    group = {'studio':'Room controls','almanac':'Field notes','gallery':'Programme','observatory':'Readouts','console':'Channels','workshop':'Workbench','signal':'Signals','folio':'Contents'}[theme]
    labels = row.get('platforms') or row.get('topics') or list(row.get('steps', {})) or list(row['sources']) or [row['name']]
    digest = hashlib.sha256(row['domain'].encode()).digest()
    cells = ''.join(f'<span style="--size:{12 + digest[i]%53}%;--pos:{digest[-i-1]%74}%"><b>{e(s.replace("_"," "))}</b></span>' for i,s in enumerate(labels[:5]))
    return f'<aside class="instrument {theme}" aria-label="{group}"><small>{group}</small><div>{cells}</div><code>{e(row["domain"])}</code></aside>'


def marketing(row, copy, guide):
    path = Path('docs/discover') / row['domain']
    path.mkdir(parents=True,exist_ok=True)
    title = e(copy['headline'])
    art = instrument(row,copy['theme'])
    kicker = e(row['name']) if copy['headline'] != row['name'] else e((row.get('categories') or [row.get('integration_type','Home Assistant integration')])[0].replace('_',' ').replace('.',' / '))
    content = f'<small>{kicker}</small><h1>{title}</h1><p>{e(copy["intro"])}</p><a class="cta" href="{guide}">Open the {e(row["name"])} guide →</a>'
    variant = int.from_bytes(hashlib.sha256(row['domain'].encode()).digest()[:2], 'big') % 4
    hero = f'<div class="hero campaign composition-{variant}"><div>{content}</div>{art}</div>'
    highlights = ''.join(f'<li>{e(h)}</li>' for h in copy['highlights'])
    body = f'<div class="story-notes"><section><h2>Inside the guide</h2><ul>{highlights or "<li>Setup and maintainer references</li>"}</ul></section><section><h2>Start exploring</h2><p>{e(row.get("summary") or row["name"])}</p><a href="{guide}#setup">Go to setup →</a></section></div>'
    return path, hero + body
