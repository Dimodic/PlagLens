"""Kafka event producer/consumer wiring for the plagiarism service."""
from .consumer import EventConsumer
from .producer import EventProducer, NullEventProducer

__all__ = ["EventConsumer", "EventProducer", "NullEventProducer"]
