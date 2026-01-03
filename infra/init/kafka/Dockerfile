# PlagLens — Kafka topics bootstrap image.
# A thin layer over the Confluent Kafka image that ensures the topic-creation
# script is executable. Used by the `kafka-init` one-shot service in compose.

FROM confluentinc/cp-kafka:7.6.1

USER root
COPY create-topics.sh /scripts/create-topics.sh
RUN chmod +x /scripts/create-topics.sh
USER appuser

ENTRYPOINT ["/bin/bash", "/scripts/create-topics.sh"]
