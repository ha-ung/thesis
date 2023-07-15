import amqp, { Channel, Connection } from "amqplib";
import dotenv from "dotenv";
import Event from "../database/Event";
import Thesis from "../database/Thesis";
import db from "../database/config";
import { Model } from "sequelize";
import { ConsumeMessage } from "amqplib";

dotenv.config();

export class Consumer {
    channel: Channel;
    queueName: string;

    async init() {
        const connection: Connection = await amqp.connect(process.env.RABBITMQ_HOST!);
        this.channel = await connection.createChannel();
        this.queueName = process.env.RABBITMQ_OUTPUT_LOCATION_EXCHANGE!;

        console.log("\nConsumer connected to " + this.queueName);
    }

    async listenMessage() {
        if (this.channel === undefined) {
            await this.init();
        }

        const exchange = await this.channel.assertExchange(this.queueName, "direct", {durable: true});
        const queue = await this.channel.assertQueue(this.queueName, {durable: true});

        await this.channel.bindQueue(this.queueName, this.queueName, this.queueName);

        this.channel.consume(this.queueName, async (message: ConsumeMessage | null) => {

            if (message) {
                let payload: {[key: string]: string} = JSON.parse(message.content.toString());
                console.log("\nReceived message from " + payload["service_type"] + " for event " + payload["id"] + "\n");

                Event.findOne({where: {id: payload["id"]}}).then(async event => {
                    if (event) {
                        if (payload["service_status"] !== "Service error") {
                            event.update({service_status: payload["service_status"], output_location: payload["output_location"], result: payload["result"]});
                        }
                        else {
                            event.update({status: payload["service_status"]});
                        }
                    }
                    else {
                        const event = Event.create(payload as any).then(async insert => {
                            console.log("New event inserted from " + payload["service_type"] + " for event " + payload["id"] + "\n");
                        }).catch(error => {
                            console.log(error);
                        });
                    }
                }).catch(error => {
                    console.log(error);
                });

                // const thesisId: string = payload["thesis_id"];

                // Thesis.findOne({where: {id: thesisId}}).then(async thesisResponse => {
                //     if (thesisResponse) {
                //         const event = Event.create(payload as any).then(async eventResponse => {
                //             console.log("New event inserted from " + payload["service_type"] + " for event " + payload["id"] + "\n");
                //         }).catch(error => {
                //             console.log(error);
                //         });
                //     }
                // }).catch(error => {
                //     console.log(error);
                // });

                // Thesis.findOne({
                //     where: {
                //         id: thesisId
                //     }
                // }).then(async thesis => {

                // }).catch(async error => {
                //     console.log("Error finding thesis.");
                // });

                // const outputLocation: string = message?.content.toString();
                // const content: string[] = outputLocation.split("/");
                // const thesisId: string = content[content.length - 1].split(".")[0];

                // const transaction = await db.sequelize.transaction();

                // Thesis.findOne({
                //     lock: true,
                //     transaction,
                //     where: {
                //         id: thesisId
                //     }
                // }).then(async thesis => {
                //     const outputLocations: string[] = thesis?.dataValues.output_locations ?? [];

                //     outputLocations.push(outputLocation);
                    
                //     Thesis.update({
                //         output_locations: outputLocations
                //     }, {
                //         transaction,
                //         where: {
                //             id: thesisId
                //         }
                //     }).then(async response => {
                //         console.log("\n\nOutput location updated for " + message.content.toString() + "\n");
                //         await transaction.commit();
                //     }).catch(async error => {
                //         console.log("Transaction error while updating");
                //         await transaction.rollback();
                //     });
                // }).catch(async error => {
                //     console.log("Transaction error while finding");
                //     await transaction.rollback();
                // });
            }

            this.channel.ack(message!);
        });
    }
}


