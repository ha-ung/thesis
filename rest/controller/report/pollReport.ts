import { Request, Response } from "express";
import Thesis from "../../database/Thesis";
import { Model } from "sequelize";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

// const pollReport = async (req: Request, res: Response) => {
//     const studentId: string = req.body.student_id.toUpperCase();
//     const thesisId: string = req.body.thesis_id;
//     const submission: Model | null = await Thesis.findOne({where: {id: thesisId}});

//     if (!submission) {
//         res.status(400).send("Submission doesn't exist.");
//     }
//     else {
//         const fileFullName: string = submission.dataValues.file_name;
//         const fileName: string = fileFullName.split(".")[0];
//         const id = submission.dataValues.id;
//         const version = submission.dataValues.version;

//         const services: string[] = JSON.parse(process.env.SERVICE_LIST!) ?? [];
//         let count: {[service: string]: boolean} = {};
//         let numOfCompleteServices: number = 0;

//         services.forEach(service => {
//             count[service] = false;

//             if (fs.existsSync(path.join(process.env.ROOT_DIR!, service, process.env.SERVICE_OUTPUT_DIR!, studentId, "version-" + version + "-" + id, fileName + "-" + service.replace("_", "-") + ".txt"))) {
//                 count[service] = true;
//                 numOfCompleteServices++;
//             }
//         });

//         const data: any = {};
        
//         if (numOfCompleteServices === services.length) {
//             data.message = "Process finished.";
//             res.status(200).send(data);
//         }
//         else {
//             data.message = "Process not finished.";
//             data.complete_services = [];

//             for (const service in count) {
//                 if (count[service]) {
//                     data.complete_services.push(service);
//                 }
//             }

//             res.status(200).send(data);
//         }
//     }
// }

const pollReport = async (req: Request, res: Response) => {
    const thesisId: string = req.body.thesis_id;
    const submission: Model | null = await Thesis.findOne({where: {id: thesisId}});

    if (!submission) {
        res.status(400).send("Submission doesn't exist.");
    }
    else {
        const services: string[] = process.env.SERVICE_LIST?.split(",") ?? [];
        const completeServices: string[] = [];
        const data: any = {};

        const outputLocations: string[] = submission?.dataValues.output_locations;

        if (outputLocations?.length > 0) {
            for (let i = 0; i < services.length; i++) {
                for (let j = 0; j < outputLocations.length; j++) {
                    if (services[i] === outputLocations[j].split("/")[0]) {
                        completeServices.push(services[i]);
                        break;
                    }
                }
            }
        }

        if (completeServices.length === services.length) {
            data.message = "Process finished.";
            res.status(200).send(data);
        }
        else {
            data.message = "Process not finished.";
            data.complete_services = completeServices;
            res.status(200).send(data);
        }
    }
}

export default pollReport;