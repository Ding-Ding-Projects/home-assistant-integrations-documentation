"""Choose related guides by shared purpose and implementation metadata."""
from collections import defaultdict
from html import escape


def recommendations(rows):
    by_tag = defaultdict(set)
    profiles = {}
    by_domain = {row['domain']: row for row in rows}
    for row in rows:
        domain = row['domain']
        tags = {('category',x) for x in row.get('categories', [])}
        tags.update(('connection',x) for x in row.get('connectivity', []))
        tags.update(('platform',x) for x in row.get('platforms', []))
        profiles[domain] = tags
        for tag in tags:
            by_tag[tag].add(domain)
    output = {}
    for domain,tags in profiles.items():
        scores = defaultdict(float)
        for tag in sorted(tags):
            group = by_tag[tag]
            weight = (5 if tag[0] == 'category' else 1) / len(group)
            for candidate in group:
                if candidate != domain:
                    scores[candidate] += weight
        parent = by_domain[domain].get('supported_by')
        if parent in by_domain:
            scores[parent] += 10
        chosen = sorted(scores,key=lambda d:(-scores[d],d))[:3]
        links = ''.join(f'<li><a href="../{item}/">{escape(by_domain[item]["name"])}</a></li>' for item in chosen)
        output[domain] = '<aside class="reading"><h2>Related guides</h2><ul>'+links+'</ul></aside>' if links else ''
    return output
