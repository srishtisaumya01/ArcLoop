"""A small, explicit resource layer shared by the planner and reminder collections.

Each collection is a ``Resource`` subclass that names its columns and their kinds, which of them
a client may write, and the rules that run on every write. ``ResourceView`` exposes it as:

    GET    /<name>/?<column>[__op]=value&order=a,-b&limit=&offset=   -> {"results": [row, ...]}
    POST   /<name>/   (one object or a list, all-or-nothing)           -> 201 {"results": [row, ...]}
    PATCH  /<name>/?<filters>   (at least one filter required)         -> {"results": [updated rows]}
    DELETE /<name>/?<filters>   (at least one filter required)         -> {"results": [deleted rows]}

Every query starts from ``scope(user)``: a user can only ever see or change their own rows, whatever
the request says. Rows are returned with the same snake_case columns and value shapes the planner
client already understands (dates ``YYYY-MM-DD``, times ``HH:MM:SS``, completion as a number).
Operators: eq (bare), neq, lt, lte, gt, gte, in (comma separated), isnull (true/false).
"""
import datetime as dt
import re
import uuid
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from rest_framework.response import Response
from rest_framework.views import APIView

from .errors import conflict, constraint_violation, not_found, permission_denied, validation_error

MAX_PAGE = 1000
MAX_IN = 200
MAX_BATCH = 200
OPERATORS = {'neq': 'exact', 'lt': 'lt', 'lte': 'lte', 'gt': 'gt', 'gte': 'gte'}
RESERVED = {'order', 'limit', 'offset'}
_TIME = re.compile(r'^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$')


def parse_value(kind, value, field='value'):
    """Raw JSON / query-string value -> a Python value of the column's kind. Raises validation_error."""
    bad = validation_error('Please check the highlighted details.', {field: 'That value is not valid.'})
    try:
        if kind == 'uuid':
            if not isinstance(value, (str, uuid.UUID)):
                raise ValueError
            return uuid.UUID(str(value))
        if kind == 'text':
            if not isinstance(value, str):
                raise ValueError
            return value
        if kind == 'bool':
            if isinstance(value, bool):
                return value
            if value in ('true', 'false'):
                return value == 'true'
            raise ValueError
        if kind == 'int':
            if isinstance(value, bool) or not isinstance(value, (int, str)):
                raise ValueError
            return int(value)
        if kind == 'date':
            if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                raise ValueError
            return dt.date.fromisoformat(value)
        if kind == 'time':
            match = _TIME.match(value) if isinstance(value, str) else None
            if not match:
                raise ValueError
            return dt.time(int(match[1]), int(match[2]), int(match[3] or 0))
        if kind == 'datetime':
            if not isinstance(value, str):
                raise ValueError
            parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
        if kind == 'number':
            if isinstance(value, bool) or not isinstance(value, (int, float, str)):
                raise ValueError
            return Decimal(str(value))
        if kind == 'intlist':
            if not isinstance(value, list) or any(isinstance(v, bool) or not isinstance(v, int) for v in value):
                raise ValueError
            return value
        if kind == 'uuidlist':
            if not isinstance(value, list):
                raise ValueError
            return [str(uuid.UUID(str(v))) for v in value]
    except (ValueError, TypeError, InvalidOperation, AttributeError):
        raise bad
    raise AssertionError(f'unknown kind {kind}')


def format_value(kind, value):
    if value is None:
        return None
    if kind == 'uuid' or isinstance(value, uuid.UUID):
        return str(value)
    if kind == 'date':
        return value.isoformat()
    if kind == 'time':
        return value.strftime('%H:%M:%S')
    if kind == 'datetime':
        return value.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
    if kind == 'number':
        return float(value)
    return value


class Resource:
    """Subclass and fill in. All hooks receive the signed-in ``user``; none trust client-supplied ownership."""

    name = ''
    model = None
    fields = {}  # every output column -> kind
    insert_fields = ()  # writable on create (``user_id`` allowed, but must be the caller)
    update_fields = ()  # writable afterwards
    nullable = ()  # writable columns that accept null
    order_default = ('created_at',)

    def scope(self, user):
        return self.model.objects.filter(user=user)

    def mutable(self, user, qs):
        """Rows a client may change or delete. Rows outside it behave as if they did not exist (like RLS)."""
        return qs

    def deletable(self, user, qs):
        return self.mutable(user, qs)

    def row(self, obj):
        data = {}
        for column, kind in self.fields.items():
            data[column] = format_value(kind, getattr(obj, column))
        return data

    # --- writes -----------------------------------------------------------------------------
    def read_input(self, data, allowed, user):
        """Body object -> {column: parsed value}. Columns a client may not write are refused, not ignored."""
        if not isinstance(data, dict):
            raise validation_error('The request could not be read.')
        out = {}
        for column, raw in data.items():
            if column not in allowed:
                raise permission_denied()
            if raw is None:
                if column not in self.nullable:
                    raise validation_error('Please check the highlighted details.', {column: 'This is required.'})
                out[column] = None
            else:
                if self.fields[column] == 'number' and not isinstance(raw, (int, float)):
                    raise validation_error('Please check the highlighted details.', {column: 'That value is not valid.'})
                out[column] = parse_value(self.fields[column], raw, column)
        owner = out.pop('user_id', None) if 'user_id' in out else None
        if owner is not None and str(owner) != str(user.pk):
            raise permission_denied()
        return out

    def create(self, user, values):
        raise NotImplementedError

    def update(self, user, obj, values):
        raise NotImplementedError

    def before_delete(self, user, obj):
        pass


class ResourceView(APIView):
    resource = None

    # --- helpers ----------------------------------------------------------------------------
    def filtered(self, request, qs, require=False):
        res = self.resource
        applied = 0
        for key, raw in request.query_params.items():
            if key in RESERVED:
                continue
            column, _, op = key.partition('__')
            kind = res.fields.get(column)
            if kind is None or op not in ('', 'in', 'isnull', *OPERATORS):
                raise validation_error('That filter is not supported.', {key: 'Unknown filter.'})
            if column == 'user_id':
                if str(parse_value('int', raw, key)) != str(request.user.pk):
                    qs = qs.none()
                applied += 1
                continue
            if op == 'isnull':
                qs = qs.filter(**{f'{column}__isnull': parse_value('bool', raw, key)})
            elif op == 'in':
                parts = [p for p in raw.split(',') if p != '']
                if len(parts) > MAX_IN:
                    raise validation_error('Too many values.', {key: 'Too many values.'})
                qs = qs.filter(**{f'{column}__in': [parse_value(kind, p, key) for p in parts]})
            elif op == 'neq':
                qs = qs.exclude(**{column: parse_value(kind, raw, key)})
            else:
                lookup = column if op == '' else f'{column}__{OPERATORS[op]}'
                qs = qs.filter(**{lookup: parse_value(kind, raw, key)})
            applied += 1
        if require and applied == 0:
            raise validation_error('Say which rows to change.')
        return qs

    def ordered(self, request, qs):
        res = self.resource
        spec = request.query_params.get('order') or ','.join(res.order_default)
        terms = []
        for part in [p for p in spec.split(',') if p]:
            column = part.lstrip('-')
            if column not in res.fields or res.fields[column] in ('intlist', 'uuidlist'):
                raise validation_error('That sort is not supported.', {'order': 'Unknown column.'})
            terms.append(part)
        return qs.order_by(*terms, 'pk')

    def respond(self, objs, status=200):
        return Response({'results': [self.resource.row(o) for o in objs]}, status=status)

    # --- verbs ------------------------------------------------------------------------------
    def get(self, request):
        res = self.resource
        qs = self.ordered(request, self.filtered(request, res.scope(request.user)))
        limit = min(parse_value('int', request.query_params.get('limit', MAX_PAGE), 'limit'), MAX_PAGE)
        offset = parse_value('int', request.query_params.get('offset', 0), 'offset')
        if limit < 0 or offset < 0:
            raise validation_error('That page is not valid.')
        return self.respond(list(qs[offset:offset + limit]))

    def post(self, request):
        res = self.resource
        items = request.data if isinstance(request.data, list) else [request.data]
        if not 1 <= len(items) <= MAX_BATCH:
            raise validation_error('Send between 1 and %d items.' % MAX_BATCH)
        created = []
        try:
            with transaction.atomic():
                for item in items:
                    values = res.read_input(item, res.insert_fields, request.user)
                    created.append(res.create(request.user, values))
        except IntegrityError as e:
            raise self.integrity(e)
        return self.respond(created, status=201)

    def patch(self, request):
        res = self.resource
        qs = self.ordered(request, self.filtered(request, res.mutable(request.user, res.scope(request.user)), require=True))
        updated = []
        try:
            with transaction.atomic():
                # Lock the matched rows. A filter such as "not yet notified" is a compare-and-set, and under PostgreSQL's default
                # isolation two simultaneous requests could both match before either writes (so both would "win"). With the lock
                # the second waits, then re-checks the filter against the committed row. SQLite ignores this: it serialises writers.
                for obj in qs.select_for_update():
                    values = res.read_input(request.data, res.update_fields, request.user)
                    updated.append(res.update(request.user, obj, values))
        except IntegrityError as e:
            raise self.integrity(e)
        return self.respond(updated)

    def delete(self, request):
        res = self.resource
        qs = self.ordered(request, self.filtered(request, res.deletable(request.user, res.scope(request.user)), require=True))
        deleted = []
        with transaction.atomic():
            for obj in qs:
                res.before_delete(request.user, obj)
                snapshot = res.row(obj)
                obj.delete()
                deleted.append(snapshot)
        return Response({'results': deleted})

    @staticmethod
    def integrity(error):
        text = str(error).lower()
        if 'unique' in text:
            return conflict()
        if 'foreign key' in text:
            return not_found('Something this refers to could not be found.')
        return constraint_violation()
