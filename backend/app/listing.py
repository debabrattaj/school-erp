"""Shared list-query behaviour: search, sort and paging.

Every CRUD list on this API returned its whole table. That is fine for
reference data -- classes, subjects, rooms, master data are tens of rows -- but
the tables that grow with students multiplied by time (fees, homework, library
issues, ledger entries, mess attendance, enrolments, admissions) reach tens of
thousands of rows, and shipping all of them to a phone costs megabytes and
seconds on every open.

Paging alone would not be enough: a client that searches its loaded rows would
silently be searching only the page it happens to hold, which is worse than
searching everything slowly. So search and sort move to the server with it.
"""

from sqlalchemy import or_


def apply_listing(
    query,
    model,
    *,
    search: str | None = None,
    search_fields: tuple[str, ...] = (),
    sort: str | None = None,
    order: str = "asc",
    limit: int | None = None,
    offset: int = 0,
    default_order=None,
):
    """Narrow, order and page a list query.

    Every argument is optional and omitting all of them leaves the query as it
    was, so a caller that passes nothing still gets the full list in the same
    order it always got -- which is what keeps this additive for existing
    clients.

    `sort` is matched against the model's own columns and ignored otherwise, so
    a client cannot use it to reach a column that is not there.
    """
    if search and search_fields:
        term = f"%{search.strip()}%"
        clauses = [
            getattr(model, field).ilike(term)
            for field in search_fields
            if hasattr(model, field)
        ]
        if clauses:
            query = query.filter(or_(*clauses))

    ordered = False
    if sort and hasattr(model, sort):
        column = getattr(model, sort)
        query = query.order_by(column.desc() if order == "desc" else column.asc())
        ordered = True

    if not ordered and default_order is not None:
        query = query.order_by(*default_order)

    if offset:
        query = query.offset(offset)

    if limit is not None:
        query = query.limit(max(0, limit))

    return query
