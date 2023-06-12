import { Request, Response } from "express";
import Thesis from "../../database/Thesis";
import { Storage, Bucket, File } from "@google-cloud/storage";
import PDFDocument, { output } from "pdfkit";
import { Model } from "sequelize";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

import formatDataWordFrequency from "./services/wordFrequency";
import formatDataChapterSummarization from "./services/chapterSummarization";
import formatDataPageCount from "./services/pageCount";
import internal from "stream";

dotenv.config();

// const getReport = async (req: Request, res: Response) => {
//     const studentId: string = req.body.student_id.toUpperCase();
//     const thesisId: string = req.body.thesis_id;
//     const reportType: string = req.body.report_type;

//     const submission: Model|null = await Thesis.findOne({where: {id: thesisId}});

//     if (!submission) {
//         res.status(400).send("Submission doesn't exist");
//     }
//     else {
//         const id: string = submission.dataValues.id;
//         const originalName: string = submission.dataValues.file_name;
//         const version: number = submission.dataValues.version;

//         if (reportType === "full") {
//             const services: string[] = JSON.parse(process.env.SERVICE_LIST!) ?? [];
//             let content: string = "";
            
//             services.forEach(service => {
//                 const fileName: string = originalName.split(".")[0] + "-" + service.replace("_", "-") + ".txt";
//                 const reportPath: string = path.join(process.env.ROOT_DIR!, service, "output", studentId, "version-" + version + "-" + id, fileName);

//                 const fileContent: string = fs.readFileSync(reportPath, "utf8");
                
//                 content += "\n"
//                 content += service.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") + ":\n";
//                 content += fileContent + "\n-------------------------------------------\n";
//             });

//             const doc = new PDFDocument({
//                 margins: {
//                     top: 50,
//                     bottom: 50,
//                     left: 60,
//                     right: 60
//                 },
//                 autoFirstPage: true,
//                 bufferPages: true,
//             });
//             const buffer: any[] = [];

//             doc.on("data", buffer.push.bind(buffer));
//             doc.on("end", () => {
//                 const pdf = Buffer.concat(buffer);

//                 res.setHeader("Content-Disposition", "attachment; filename=report.pdf");
//                 res.setHeader("Content-Type", "application/octet stream");
//                 res.status(200).send(pdf);
//             });

//             doc.text(content.replace(/\r\n|\r/g, "\n"));
//             doc.end();
//         }
//         else {
//             const fileName: string = originalName.split(".")[0] + "-" + reportType.replace("_", "-") + ".txt";
//             const reportPath: string = path.join(process.env.ROOT_DIR!, reportType, "output", studentId, "version-" + version + "-" + id, fileName);
//             const dataReturn: any = {};

//             fs.readFile(reportPath, {encoding: "utf-8"}, (error, data) => {
//                 if (!error) {
//                     dataReturn["text"] = {};
//                     let formattedData: {} | string = data;

//                     if (reportType === "chapter_summarization") {
//                         formattedData = formatDataChapterSummarization(data);
//                     }
//                     else if (reportType === "word_frequency") {
//                         formattedData = formatDataWordFrequency(data);
//                     }
//                     else if (reportType === "page_count") {
//                         formattedData = formatDataPageCount(data);
//                     }

//                     dataReturn["text"] = formattedData;
//                     res.status(200).send(dataReturn);
//                 }
//                 else {
//                     dataReturn.error_message = "Error getting file.";
//                     res.status(500).send(dataReturn);
//                 }
//             });
//         }
//     }
// }

const readStreamIntoString = async (stream: internal.Readable) => {
    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString("utf-8");
}

const getReport = async (req: Request, res: Response) => {
    const thesisId: string = req.body.thesis_id;
    const reportType: string = req.body.report_type;

    const thesis: Model|null = await Thesis.findOne({where: {id: thesisId}});

    if (!thesis) {
        res.status(400).send("Submission doesn't exist");
    }
    else {
        const id: string = thesis.dataValues.id;
        const outputLocations: string[] = thesis.dataValues.output_locations;

        const storage = new Storage();
        const bucketName: string = process.env.GOOGLE_CLOUD_STORAGE_BUCKET!;
        const bucket: Bucket = storage.bucket(bucketName);

        try {
            if (reportType !== "full") {
                let filePath: string = "";

                for (let i = 0; i < outputLocations.length; i++) {
                    if (outputLocations[i].split("/")[0].includes(reportType)) {
                        filePath = outputLocations[i];
                        break;
                    }
                }

                const blob: File = bucket.file(filePath);
                const readStream: internal.Readable = blob.createReadStream();

                const content: string = await readStreamIntoString(readStream);
                const dataReturn: any = {text: content};

                switch (reportType) {
                    case "word_frequency":
                        dataReturn.text = formatDataWordFrequency(content);
                        break;

                    case "chapter_summarization":
                        dataReturn.text = formatDataChapterSummarization(content);
                        break;

                    case "page_count":
                        dataReturn.text = formatDataPageCount(content);
                        break;
                }

                res.status(200).send(dataReturn);
            }
            else {
                let content: string = "";
                let blob: File;
                let readStream: internal.Readable;

                for (let i = 0; i < outputLocations.length; i++) {
                    blob = bucket.file(outputLocations[i]);
                    readStream = blob.createReadStream();

                    const text: string = await readStreamIntoString(readStream);
                    content += text + "\n";

                    content += "----------------------------------------------------------------------------------\n";
                }

                const doc = new PDFDocument({
                    margins: {
                        top: 50,
                        bottom: 50,
                        left: 60,
                        right: 60
                    },
                    autoFirstPage: true,
                    bufferPages: true,
                });
                const buffer: any[] = [];
    
                doc.on("data", buffer.push.bind(buffer));
                doc.on("end", () => {
                    const pdf = Buffer.concat(buffer);
    
                    res.setHeader("Content-Disposition", "attachment; filename=report.pdf");
                    res.setHeader("Content-Type", "application/octet stream");
                    res.status(200).send(pdf);
                });
    
                doc.text(content.replace(/\r\n|\r/g, "\n"));
                doc.end();
            }
        } catch (error) {
            console.log(error);
            res.status(500).send({error: "Report still loading/Error reading report."});
        }

        // if (reportType === "full") {
        //     const services: string[] = JSON.parse(process.env.SERVICE_LIST!) ?? [];
        //     let content: string = "";
            
        //     services.forEach(service => {
        //         const fileName: string = originalName.split(".")[0] + "-" + service.replace("_", "-") + ".txt";
        //         const reportPath: string = path.join(process.env.ROOT_DIR!, service, "output", studentId, "version-" + version + "-" + id, fileName);

        //         const fileContent: string = fs.readFileSync(reportPath, "utf8");
                
        //         content += "\n"
        //         content += service.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") + ":\n";
        //         content += fileContent + "\n-------------------------------------------\n";
        //     });

        //     const doc = new PDFDocument({
        //         margins: {
        //             top: 50,
        //             bottom: 50,
        //             left: 60,
        //             right: 60
        //         },
        //         autoFirstPage: true,
        //         bufferPages: true,
        //     });
        //     const buffer: any[] = [];

        //     doc.on("data", buffer.push.bind(buffer));
        //     doc.on("end", () => {
        //         const pdf = Buffer.concat(buffer);

        //         res.setHeader("Content-Disposition", "attachment; filename=report.pdf");
        //         res.setHeader("Content-Type", "application/octet stream");
        //         res.status(200).send(pdf);
        //     });

        //     doc.text(content.replace(/\r\n|\r/g, "\n"));
        //     doc.end();
        // }
        // else {
        //     const fileName: string = originalName.split(".")[0] + "-" + reportType.replace("_", "-") + ".txt";
        //     const reportPath: string = path.join(process.env.ROOT_DIR!, reportType, "output", studentId, "version-" + version + "-" + id, fileName);
        //     const dataReturn: any = {};

        //     fs.readFile(reportPath, {encoding: "utf-8"}, (error, data) => {
        //         if (!error) {
        //             dataReturn["text"] = {};
        //             let formattedData: {} | string = data;

        //             if (reportType === "chapter_summarization") {
        //                 formattedData = formatDataChapterSummarization(data);
        //             }
        //             else if (reportType === "word_frequency") {
        //                 formattedData = formatDataWordFrequency(data);
        //             }
        //             else if (reportType === "page_count") {
        //                 formattedData = formatDataPageCount(data);
        //             }

        //             dataReturn["text"] = formattedData;
        //             res.status(200).send(dataReturn);
        //         }
        //         else {
        //             dataReturn.error_message = "Error getting file.";
        //             res.status(500).send(dataReturn);
        //         }
        //     });
        // }
    }
}

export default getReport;