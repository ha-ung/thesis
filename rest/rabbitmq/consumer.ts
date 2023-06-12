import amqp, { Channel, Connection } from "amqplib";
import dotenv from "dotenv";
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
                console.log("\nReceived " + message.content.toString() + "\n");

                const outputLocation: string = message?.content.toString();
                const content: string[] = outputLocation.split("/");
                const thesisId: string = content[content.length - 1].split(".")[0];

                const transaction = await db.sequelize.transaction();

                Thesis.findOne({
                    lock: true,
                    transaction,
                    where: {
                        id: thesisId
                    }
                }).then(async thesis => {
                    const outputLocations: string[] = thesis?.dataValues.output_locations ?? [];

                    outputLocations.push(outputLocation);
                    
                    Thesis.update({
                        output_locations: outputLocations
                    }, {
                        transaction,
                        where: {
                            id: thesisId
                        }
                    }).then(async response => {
                        console.log("\n\nOutput location updated for " + message.content.toString() + "\n");
                        await transaction.commit();
                    }).catch(async error => {
                        console.log("Transaction error while updating");
                        await transaction.rollback();
                    });
                }).catch(async error => {
                    console.log("Transaction error while finding");
                    await transaction.rollback();
                });

                // Thesis.findOne({
                //     lock: true,
                //     transaction,
                //     where: {
                //         id: thesisId
                // }}).then(thesis => {
                //     const outputLocations: string[] = thesis?.dataValues.output_locations ?? [];

                //     outputLocations.push(outputLocation);

                //     console.log("\n Updated output locations: ");
                //     outputLocations.forEach(location => console.log(location + ", "));
                //     console.log("\n");

                //     Thesis.update({
                //         output_locations: outputLocations
                //     }, {
                //         where: {
                //             id: thesisId
                //         }
                //     }).then(response => console.log("\n\nOutput location updated for " + message.content.toString()) + "\n");
                // }).catch(async error => {
                //     console.log(error);
                //     await transaction.rollback();
                // });
            }

            this.channel.ack(message!);
        });
    }
}


