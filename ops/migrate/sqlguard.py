#!/usr/bin/env python3
"""Refuse SQL that must not run inside the wrapper's single transaction.

Rejects (outside comments, string literals and dollar-quoted bodies, so the
BEGIN/END of a PL/pgSQL function body are allowed):
  - transaction control statements: BEGIN, COMMIT, ROLLBACK, END, ABORT,
    START TRANSACTION, SAVEPOINT, RELEASE, PREPARE TRANSACTION
  - CONCURRENTLY and VACUUM anywhere (cannot run in a transaction)
  - COPY ... PROGRAM
  - psql meta-commands (a line starting with a backslash), e.g. \\! shell
Exit 0 when clean, 1 with the reason otherwise. Prints no SQL.
"""
import re
import sys

TX = {"BEGIN", "COMMIT", "ROLLBACK", "END", "ABORT", "START", "SAVEPOINT", "RELEASE", "PREPARE"}


def strip(sql: str) -> str:
    out, i, n = [], 0, len(sql)
    while i < n:
        c = sql[i]
        if sql.startswith("--", i):
            j = sql.find("\n", i)
            i = n if j < 0 else j
        elif sql.startswith("/*", i):
            depth, i = 1, i + 2
            while i < n and depth:
                if sql.startswith("/*", i):
                    depth, i = depth + 1, i + 2
                elif sql.startswith("*/", i):
                    depth, i = depth - 1, i + 2
                else:
                    i += 1
        elif c == "'":
            i += 1
            while i < n:
                if sql[i] == "'" and i + 1 < n and sql[i + 1] == "'":
                    i += 2
                elif sql[i] == "'":
                    i += 1
                    break
                else:
                    i += 1
            out.append("''")
        elif c == "$":
            m = re.match(r"\$([A-Za-z_][A-Za-z0-9_]*)?\$", sql[i:])
            if m:
                tag = m.group(0)
                j = sql.find(tag, i + len(tag))
                if j < 0:
                    raise ValueError("unterminated dollar-quoted body")
                out.append("$$")
                i = j + len(tag)
            else:
                out.append(c)
                i += 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


def problems(sql: str) -> list[str]:
    found = []
    for k, line in enumerate(sql.splitlines(), 1):
        if line.lstrip().startswith("\\"):
            found.append(f"psql meta-command on line {k}")
    try:
        body = strip(sql)
    except ValueError as e:
        return found + [str(e)]
    for stmt in body.split(";"):
        words = re.findall(r"[A-Za-z_]+", stmt)
        if words and words[0].upper() in TX:
            found.append(f"transaction control statement: {words[0].upper()}")
    for word in ("CONCURRENTLY", "VACUUM"):
        if re.search(rf"\b{word}\b", body, re.I):
            found.append(f"{word} is not allowed")
    if re.search(r"\bCOPY\b[^;]*\bPROGRAM\b", body, re.I):
        found.append("COPY ... PROGRAM is not allowed")
    return found


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        p = problems(f.read())
    if p:
        for x in sorted(set(p)):
            print(f"sqlguard: REFUSED: {x}")
        sys.exit(1)
    print("sqlguard: ok (no transaction control, CONCURRENTLY, VACUUM, COPY PROGRAM or psql meta-commands)")
