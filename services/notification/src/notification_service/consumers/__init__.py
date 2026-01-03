"""Kafka consumers."""
from notification_service.consumers.dispatcher import KafkaDispatcher, process_event

__all__ = ["KafkaDispatcher", "process_event"]
