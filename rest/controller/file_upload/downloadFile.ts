import { Request, Response } from "express";
import Thesis from "../../database/Thesis";
import { Model } from "sequelize";
import { Storage, Bucket, File } from "@google-cloud/storage";

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// const downloadFile = async (req: Request, res: Response) => {
//     const thesisId: string = req.body.thesis_id;
    
//     const thesis: Model | null = await Thesis.findOne({where: {id: thesisId}});

//     if (!thesis) {
//         res.status(400).send("Thesis not found.");
//     }
//     else {
//         const studentId: string = thesis.dataValues.student_id.toLowerCase();
//         const version: number = thesis.dataValues.version;
//         const fileName: string = thesis.dataValues.file_name;

//         const filePath: string = path.join(process.env.APP_ROOT_PATH!, studentId, "version-" + version + "-" + thesisId, fileName);
        
//         // res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
//         // res.setHeader("Content-Type", "application/pdf");
//         res.sendFile(filePath, (error) => {
//             if (error) {
//                 res.status(500);
//             }
//             else {
//                 res.status(200);
//             }
//         });
//     }
// }

const downloadFile = async (req: Request, res: Response) => {
    const thesisId: string = req.body.thesis_id;
    
    const thesis: Model | null = await Thesis.findOne({where: {id: thesisId}});

    if (!thesis) {
        res.status(400).send("Thesis not found.");
    }
    else {
        const studentId: string = thesis.dataValues.student_id.toLowerCase();
        const fileName: string = thesis.dataValues.file_name;

        const filePath: string = `${process.env.APP_NAME}/${fileName}.pdf`;

        const storage = new Storage();
        const bucketName: string = process.env.GOOGLE_CLOUD_STORAGE_BUCKET!;
        const bucket: Bucket = storage.bucket(bucketName);

        try {
            const blob: File = bucket.file(filePath);
            const readStream = blob.createReadStream();

            res.setHeader("Content-Type", "application/pdf");
            readStream.pipe(res);
            res.status(200);
        } catch (error) {
            console.log(error);
            res.status(500).send("Error sending file.");
        }
        
        // res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

        // res.sendFile(filePath, (error) => {
        //     if (error) {
        //         res.status(500);
        //     }
        //     else {
        //         res.status(200);
        //     }
        // });
    }
}

export default downloadFile;