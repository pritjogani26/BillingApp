from django.db import connection


def _dictfetch(cursor):
    """Return all rows from cursor as list of dicts."""
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def query_all(sql: str, params: tuple = ()):
    """Execute SELECT and return list of dicts."""
    with connection.cursor() as cur:
        cur.execute(sql, params)
        return _dictfetch(cur)


def query_one(sql: str, params: tuple = ()):
    """Execute SELECT and return single dict or None."""
    with connection.cursor() as cur:
        cur.execute(sql, params)
        if cur.description is None:
            return None
        cols = [col[0] for col in cur.description]
        row = cur.fetchone()
        return dict(zip(cols, row)) if row else None


def execute(sql: str, params: tuple = ()):
    """Execute INSERT / UPDATE / DELETE. Returns rowcount."""
    with connection.cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount


def insert_returning(sql: str, params: tuple = ()):
    """Execute INSERT … RETURNING and return the returned row as dict."""
    with connection.cursor() as cur:
        cur.execute(sql, params)
        cols = [col[0] for col in cur.description]
        row  = cur.fetchone()
        return dict(zip(cols, row)) if row else None