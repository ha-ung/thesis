import pika
import os
from dotenv import load_dotenv

class Producer:
    def __init__(self):
        load_dotenv()

        self.output_location_exchange = os.environ.get("RABBITMQ_OUTPUT_LOCATION_EXCHANGE")
        self.output_location_queue = os.environ.get("RABBITMQ_OUTPUT_LOCATION_EXCHANGE")
        self.host = os.environ.get("RABBITMQ_HOST")
        self.port = os.environ.get("RABBITMQ_PORT")
        self.user = os.environ.get("RABBITMQ_USER")
        self.password = os.environ.get("RABBITMQ_PASSWORD")
        self.connection = self.connect()

    def connect(self):
        parameters = pika.ConnectionParameters(self.host, self.port, "/", pika.PlainCredentials(self.user, self.password))
        return pika.BlockingConnection(parameters)
    
    def publish_message(self, message):
        channel = self.connection.channel()

        channel.queue_declare(queue=self.output_location_queue, durable=True)
        channel.basic_publish(exchange=self.output_location_exchange, routing_key=self.output_location_queue, body=message)

        print("Sent message to output_location: " + message)
