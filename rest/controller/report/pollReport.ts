import { Request, Response } from "express";
import Thesis from "../../database/Thesis";
import Event from "../../database/Event";
import { Model } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const getEventResult = (eventId: string) => {

}


const pollReport = async (req: Request, res: Response) => {
    const thesisId: string = req.body.thesis_id;

    const events: Model[] | null = await Event.findAll({where: {thesis_id: thesisId}});

    if (events) {
        let eventServices: any[] = [];
        let count: number = 0;
        const data: {[key: string]: any} = {};

        eventServices = events.map(event => event.dataValues);
        eventServices = eventServices.map(({service_type, service_status, result}) => ({service_type, service_status, result}));

        data.services = eventServices;

        let services: string | string[] = process.env.SERVICE_LIST!;
        services = services.split(",");

        if (eventServices.filter(service => service.service_status === "Finished").length === services.length) {
            data.finished = true;
        }
        
        res.status(200).send(data);
    }
    else {
        res.status(500).send("Events not found for thesis.");
    }

    // if (!submission) {
    //     res.status(400).send("Submission doesn't exist.");
    // }
    // else {
    //     const services: string[] = process.env.SERVICE_LIST?.split(",") ?? [];
    //     const completeServices: string[] = [];
    //     const serviceResults: {[key: string]: string}[] = [];
    //     const data: any = {};

    //     const outputLocations: string[] = submission?.dataValues.output_locations;

    //     if (outputLocations?.length > 0) {
    //         for (let i = 0; i < services.length; i++) {
    //             for (let j = 0; j < outputLocations.length; j++) {
    //                 const outputLocation: string = outputLocations[j].split(":")[0];

    //                 if (services[i] === outputLocation.split("/")[0]) {
    //                     const result: string = outputLocations[j].split(":")[1];

    //                     serviceResults.push({[services[i]]: result});
    //                     completeServices.push(services[i]);
    //                     break;
    //                 }
    //             }
    //         }
    //     }

    //     if (completeServices.length === services.length) {
    //         data.message = "Process finished.";
    //         data.results = serviceResults;
    //         res.status(200).send(data);
    //     }
    //     else {
    //         data.message = "Process not finished.";
    //         data.complete_services = completeServices;
    //         data.results = serviceResults;
    //         res.status(200).send(data);
    //     }
    // }
}

export default pollReport;