"""Source check for agent output: do the CVE ids exist and do the links answer?

Deterministic and token-free. Only runs when you press "Check sources" on a result. It never sends your data
anywhere: it looks up public CVE ids at cve.org and sends HEAD requests to the https links the agent wrote.
Agent output is DATA, so every link is vetted first: https only, public IP addresses only, no redirects followed.
"""
import ipaddress
import re
import socket
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

CVE_RE = re.compile(r"\bCVE-\d{4}-\d{4,7}\b")
URL_RE = re.compile(r"https://[^\s<>\"'`)\]]+")
MAX_CVES, MAX_LINKS, TIMEOUT = 15, 20, 7
HEADERS = {"User-Agent": "MyOffice-source-check/1.0"}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def extract(text):
    cves = list(dict.fromkeys(CVE_RE.findall(text)))[:MAX_CVES]
    links = list(dict.fromkeys(u.rstrip(".,;:!?*_") for u in URL_RE.findall(text)))[:MAX_LINKS]
    return cves, links


def public_host(url):
    """True only for an https URL whose host resolves exclusively to public addresses."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return False
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    return bool(infos) and all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


def check_cve(cve_id):
    try:
        request = urllib.request.Request(f"https://cveawg.mitre.org/api/cve/{cve_id}", headers=HEADERS)
        with _opener.open(request, timeout=TIMEOUT) as r:
            return {"id": cve_id, "status": "found" if r.status == 200 else "unreachable"}
    except urllib.error.HTTPError as e:
        return {"id": cve_id, "status": "not_found" if e.code == 404 else "unreachable"}
    except (OSError, ValueError):
        return {"id": cve_id, "status": "unreachable"}


def check_link(url):
    if not public_host(url):
        return {"url": url, "status": "skipped", "detail": "not a public https address"}
    for method in ("HEAD", "GET"):
        try:
            request = urllib.request.Request(url, headers=HEADERS, method=method)
            with _opener.open(request, timeout=TIMEOUT) as r:
                return {"url": url, "status": "ok", "code": r.status}
        except urllib.error.HTTPError as e:
            if 300 <= e.code < 400:
                return {"url": url, "status": "ok", "code": e.code, "detail": "redirects"}
            if method == "HEAD" and e.code in (403, 405, 501):
                continue          # some servers refuse HEAD; ask once with GET
            return {"url": url, "status": "broken" if e.code in (404, 410) else "unreachable", "code": e.code}
        except (OSError, ValueError):
            return {"url": url, "status": "unreachable"}
    return {"url": url, "status": "unreachable"}


def verify_text(text):
    cves, links = extract(text)
    with ThreadPoolExecutor(max_workers=6) as pool:
        cve_results = list(pool.map(check_cve, cves))
        link_results = list(pool.map(check_link, links))
    bad = [c for c in cve_results if c["status"] == "not_found"] + [l for l in link_results if l["status"] == "broken"]
    return {"cves": cve_results, "links": link_results, "problems": len(bad),
            "note": "A found CVE id only proves the id exists, not that the agent described it correctly. "
                    "Unreachable links may just be slow or blocking bots."}
