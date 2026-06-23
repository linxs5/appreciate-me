#!/usr/bin/env python3
#
# Reddit opportunity monitor
#
# How to run on Mac with no setup:
# 1. Open Terminal.
# 2. Go to this folder:
#      cd /Users/christiansalinas/Desktop/GitHub/appreciate-me
# 3. Run it:
#      python3 reddit-monitor.py
#
# The script runs silently and checks Reddit every 6 hours.
# Matching posts are appended to reddit-opportunities.txt.
# Stop it with Control-C.
#
# Optional: run it in the background from this folder:
#      nohup python3 reddit-monitor.py >/dev/null 2>>reddit-monitor-errors.log &

import json
import os
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from html import unescape


SUBREDDITS = [
    "UsedCars",
    "projectcar",
    "Trucks",
    "FacebookMarketplace",
    "MechanicAdvice",
    "Cars",
]

KEYWORDS = [
    "selling my car",
    "maintenance records",
    "can you prove",
    "lowball",
    "trust me bro",
    "receipts",
    "service history",
    "seller provided",
    "well maintained",
    "proof of maintenance",
    "repair history",
]

CHECK_INTERVAL_SECONDS = 6 * 60 * 60
SUBREDDIT_DELAY_SECONDS = 15
RETRY_AFTER_DEFAULT_SECONDS = 120
POST_LIMIT = 25
OUTPUT_FILE = "reddit-opportunities.txt"
STATE_FILE = ".reddit-monitor-seen.json"
USER_AGENT = "python:reddit-monitor.py:1.2 (local personal monitor)"
REDDIT_BASE_URL = "https://www.reddit.com"
REDDIT_JSON_BASE_URL = "https://api.reddit.com"
REDDIT_RSS_BASE_URL = "https://www.reddit.com"


def print_error(message):
    print(message, file=sys.stderr, flush=True)


def load_seen_ids():
    if not os.path.exists(STATE_FILE):
        return set()

    try:
        with open(STATE_FILE, "r", encoding="utf-8") as state_file:
            data = json.load(state_file)
    except (OSError, json.JSONDecodeError) as exc:
        print_error(f"ERROR: Could not read {STATE_FILE}: {exc}")
        return set()

    if not isinstance(data, list):
        print_error(f"ERROR: Ignoring invalid state in {STATE_FILE}")
        return set()

    return set(str(item) for item in data)


def save_seen_ids(seen_ids):
    temp_file = f"{STATE_FILE}.tmp"
    try:
        with open(temp_file, "w", encoding="utf-8") as state_file:
            json.dump(sorted(seen_ids), state_file, indent=2)
        os.replace(temp_file, STATE_FILE)
    except OSError as exc:
        print_error(f"ERROR: Could not write {STATE_FILE}: {exc}")
        try:
            if os.path.exists(temp_file):
                os.remove(temp_file)
        except OSError:
            pass


def fetch_subreddit_posts(subreddit):
    try:
        return fetch_subreddit_rss_posts(subreddit)
    except RuntimeError as exc:
        rss_error = exc

    try:
        return fetch_subreddit_json_posts(subreddit)
    except RuntimeError as json_error:
        raise RuntimeError(
            "Reddit blocked the public RSS and JSON endpoints tried. "
            "Try a different network, turn off VPN/iCloud Private Relay if enabled, "
            "or open Reddit in your browser once and try again. "
            f"RSS error: {rss_error}; JSON error: {json_error}"
        )


def fetch_subreddit_json_posts(subreddit):
    query = urllib.parse.urlencode({"limit": POST_LIMIT, "raw_json": 1})
    quoted_subreddit = urllib.parse.quote(subreddit)
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }

    url = f"{REDDIT_JSON_BASE_URL}/r/{quoted_subreddit}/new?{query}"
    try:
        body = fetch_url(url, headers)
        payload = json.loads(body)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        raise RuntimeError(f"JSON fetch failed. Last error: {exc}")

    children = payload.get("data", {}).get("children", [])
    posts = []
    for child in children:
        post = child.get("data", {})
        if isinstance(post, dict):
            posts.append(post)

    return posts


def fetch_subreddit_rss_posts(subreddit):
    query = urllib.parse.urlencode({"limit": POST_LIMIT})
    quoted_subreddit = urllib.parse.quote(subreddit)
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/xml, text/xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }

    url = f"{REDDIT_RSS_BASE_URL}/r/{quoted_subreddit}/new/.rss?{query}"
    try:
        body = fetch_url(url, headers)
        return parse_rss_posts(body)
    except (urllib.error.URLError, TimeoutError, ET.ParseError, OSError) as exc:
        raise RuntimeError(f"RSS fetch failed. Last error: {exc}")


def fetch_url(url, headers):
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset)
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            time.sleep(retry_after_seconds(exc))
        raise


def retry_after_seconds(error):
    retry_after = error.headers.get("Retry-After")
    if retry_after:
        try:
            return min(max(int(retry_after), 1), 15 * 60)
        except ValueError:
            pass
    return RETRY_AFTER_DEFAULT_SECONDS


def parse_rss_posts(feed_xml):
    root = ET.fromstring(feed_xml)
    posts = []

    for entry in root.findall("{http://www.w3.org/2005/Atom}entry"):
        post = rss_entry_to_post(entry, atom=True)
        if post:
            posts.append(post)

    for item in root.findall(".//item"):
        post = rss_entry_to_post(item, atom=False)
        if post:
            posts.append(post)

    return posts


def rss_text(entry, tag, atom):
    if atom:
        found = entry.find(f"{{http://www.w3.org/2005/Atom}}{tag}")
    else:
        found = entry.find(tag)
    return found.text if found is not None and found.text else ""


def rss_link(entry, atom):
    if atom:
        link = entry.find("{http://www.w3.org/2005/Atom}link")
        if link is not None:
            return link.attrib.get("href", "")
        return ""
    return rss_text(entry, "link", atom)


def rss_entry_to_post(entry, atom):
    title = unescape(rss_text(entry, "title", atom))
    body = strip_html(unescape(rss_text(entry, "content", atom) or rss_text(entry, "description", atom)))
    link = rss_link(entry, atom)
    post_id = rss_text(entry, "id", atom) or rss_text(entry, "guid", atom) or link

    created = None
    published = rss_text(entry, "updated", atom) or rss_text(entry, "published", atom) or rss_text(entry, "pubDate", atom)
    if published:
        try:
            created = parsedate_to_datetime(published).timestamp()
        except (TypeError, ValueError, IndexError, OverflowError):
            created = None

    if not title and not link:
        return None

    return {
        "id": post_id,
        "title": title,
        "selftext": body,
        "permalink": link,
        "created_utc": created,
    }


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def text(self):
        return " ".join(part.strip() for part in self.parts if part.strip())


def strip_html(value):
    parser = TextExtractor()
    parser.feed(value or "")
    return parser.text()


def find_keyword(title, body):
    searchable_text = f"{title}\n{body}".casefold()
    for keyword in KEYWORDS:
        if keyword.casefold() in searchable_text:
            return keyword
    return None


def reddit_url(post):
    permalink = post.get("permalink") or ""
    if permalink.startswith("http://") or permalink.startswith("https://"):
        return permalink
    return f"{REDDIT_BASE_URL}{permalink}"


def clean_snippet(text):
    normalized = " ".join((text or "").split())
    return normalized[:200]


def post_date(post):
    created_utc = post.get("created_utc")
    if isinstance(created_utc, (int, float)):
        return datetime.fromtimestamp(created_utc).strftime("%Y-%m-%d %H:%M:%S")
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def append_match(subreddit, post, keyword):
    title = post.get("title") or ""
    body = post.get("selftext") or ""

    entry = (
        f"DATE: {post_date(post)}\n"
        f"SUBREDDIT: r/{subreddit}\n"
        f"TITLE: {title}\n"
        f"URL: {reddit_url(post)}\n"
        f"KEYWORD MATCHED: {keyword}\n"
        f"SNIPPET: {clean_snippet(body)}\n"
        "---\n"
    )

    with open(OUTPUT_FILE, "a", encoding="utf-8") as output_file:
        output_file.write(entry)


def check_once(seen_ids):
    found_new_ids = False

    for subreddit in SUBREDDITS:
        try:
            posts = fetch_subreddit_posts(subreddit)
        except (
            RuntimeError,
            urllib.error.URLError,
            urllib.error.HTTPError,
            TimeoutError,
            json.JSONDecodeError,
        ) as exc:
            print_error(f"ERROR: Could not fetch r/{subreddit}: {exc}")
            time.sleep(SUBREDDIT_DELAY_SECONDS)
            continue

        for post in reversed(posts):
            post_id = post.get("id")
            if not post_id or post_id in seen_ids:
                continue

            title = post.get("title") or ""
            body = post.get("selftext") or ""
            keyword = find_keyword(title, body)
            if keyword:
                try:
                    append_match(subreddit, post, keyword)
                except OSError as exc:
                    print_error(f"ERROR: Could not append to {OUTPUT_FILE}: {exc}")
                    continue

            seen_ids.add(post_id)
            found_new_ids = True

        time.sleep(SUBREDDIT_DELAY_SECONDS)

    if found_new_ids:
        save_seen_ids(seen_ids)


def main():
    seen_ids = load_seen_ids()

    while True:
        try:
            check_once(seen_ids)
        except KeyboardInterrupt:
            raise
        except Exception:
            print_error("ERROR: Unexpected failure during Reddit check:")
            traceback.print_exc(file=sys.stderr)

        time.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
