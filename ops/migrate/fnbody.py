#!/usr/bin/env python3
"""Print the md5 of each function body defined in a SQL file.

The body is the exact text between the dollar quotes of
`create [or replace] function <schema>.<name>(...) ... as $tag$<body>$tag$`,
which is what PostgreSQL stores in pg_proc.prosrc (independent of how
pg_get_functiondef formats a definition). Prints `name=md5` lines only.
"""
import hashlib
import re
import sys

PATTERN = re.compile(
    r"create\s+(?:or\s+replace\s+)?function\s+(?:\w+\.)?(\w+)\s*\([^)]*\).*?\bas\s+(\$\w*\$)(.*?)\2",
    re.IGNORECASE | re.DOTALL,
)

with open(sys.argv[1], encoding="utf-8") as f:
    sql = f.read()
for name, _tag, body in PATTERN.findall(sql):
    print(f"{name}={hashlib.md5(body.encode('utf-8')).hexdigest()}")
