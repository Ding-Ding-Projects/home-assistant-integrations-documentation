"""Read publishable documentation paragraphs and preserve their section context."""
import re


def paragraphs(body):
    results = []
    section = 'Overview'
    fenced = False
    text = []
    def flush():
        paragraph = ' '.join(text).strip()
        text.clear()
        paragraph = re.sub(r'{%\s*term\s+["\']?(.+?)["\']?\s*%}', r'\1', paragraph)
        paragraph = re.sub(r'{%\s*my\s+\w+\s+title="([^"]+)"\s*%}',r'\1',paragraph)
        paragraph = re.sub(r'\[([^\]]+)\]\((?:[^()]+|\([^)]*\))*\)|\[([^\]]+)\]\[[^\]]*\]', lambda m:m[1] or m[2], paragraph)
        paragraph = paragraph.replace('**','').replace('`','')
        if 40 <= len(paragraph) <= 750 and not any(s in paragraph for s in ('{%','{{','<','>','![')):
            results.append([section,paragraph])
    for line in body.splitlines():
        if line.startswith(('```','~~~')):
            flush()
            fenced = not fenced
            continue
        if fenced:
            continue
        if line.startswith('#'):
            flush()
            section = line.lstrip('# ').strip()
        elif not line.strip() or line.startswith(('<','{','[','!','|','-','*',' ','#')):
            flush()
        else:
            text.append(line.strip())
    flush()
    seen = set()
    return [item for item in results if item[0] not in seen and not seen.add(item[0])][:10]
