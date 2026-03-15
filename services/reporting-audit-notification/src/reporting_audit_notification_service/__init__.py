"""PlagLens merged Reporting + Audit + Notification service.

Composes the existing ``reporting_service``, ``audit_service`` and
``notification_service`` packages into one deployable service. Each keeps its
own Postgres schema, engine, Kafka consumer group and background jobs; this
package mounts all three router sets behind one app + one shared health surface
and drives each sub-service's own lifespan. The two internal HTTP hops
(reporting->audit events, audit->reporting exports) become in-container
loopback calls.
"""

__version__ = "0.1.0"
