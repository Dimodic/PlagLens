"""Service-specific cross-cutting helpers (adapters around ``plaglens_common``).

These modules predate the shared ``plaglens-common`` library and expose
slightly different APIs (factory helpers like :func:`not_found`, the
``Principal`` model, etc.). They remain in-tree because their public
signatures are widely used inside this service.

For all NEW code, prefer importing from :mod:`plaglens_common` directly.
"""
