import { Request, Response } from "express";
import Thesis from "../../database/Thesis";
import Student from "../../database/Student";
import { Model } from "sequelize";
import { Producer } from "../../rabbitmq/producer";

import { Storage, Bucket, File } from "@google-cloud/storage";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const uploadThesis = async (req: Request, res: Response) => {
    const student: Model | null = await Student.findOne({where: {student_id: req.body.student_id.toUpperCase()}});

    const submission: {[key: string]: string | number} = {
        id: res.locals.id,
        student_id: req.body.student_id.toUpperCase(),
        instructor_id: student?.dataValues.instructor_id,
        thesis_name: req.body.thesis_name,
        file_name: res.locals.file_name
    }

    const fileLocation: string = res.locals.file_location;
    console.log(fileLocation);

    const storage = new Storage();
    const bucketName: string = process.env.GOOGLE_CLOUD_STORAGE_BUCKET!;
    const bucket: Bucket = storage.bucket(bucketName);

    const destination: string = `${process.env.APP_NAME!}/${submission.id}.pdf`;
    const options: {[keys: string]: any} = {
        metadata: {
            contentType: "application/pdf"
        }
    }

    const blob: File = bucket.file(destination);
    const uploadStream = blob.createWriteStream(options);

    fs.createReadStream(fileLocation).pipe(uploadStream);

    uploadStream.on("error", (error) => {
        console.log(error.message);
        res.status(500).send("Error uploading to bucket.");
    });

    uploadStream.on("finish", () => {
        console.log("File uploaded to " + destination + " in bucket.");

        fs.unlinkSync(fileLocation);

        submission.file_location = destination;
        submission.submitted_time = (new Date()).toString();

        const instance = Thesis.create(submission as any).then(async thesisResponse => {
            const producer: Producer = new Producer();
            await producer.publishMessage(destination);

            if (student?.dataValues.has_submitted) {
                res.status(200).send(submission.id);
            }
            else {
                student?.set({has_submitted: true});
                
                student?.save().then(studentResponse => {
                    res.status(200).send(submission.id);
                }).catch(error => {
                    console.log(error.message);
                    res.status(500).send("Error updating student's submission status.");
                });
            }
        }).catch(error => {
            console.log(error.message);
            res.status(500).send("Error inserting new thesis into database.");
        });
    });
    //     if (error) {
    //         console.log(error.message);
    //         res.status(500).send("Error uploading to bucket.");
    //     }
    //     else {
    //         submission.file_location = uploadedFile?.metadata.name;
    //         submission.submitted_time = (new Date()).toString();
    
    //         const instance = Thesis.create(submission as any).then(async thesisResponse => {
    //             const producer: Producer = new Producer();
    //             await producer.publishMessage(uploadedFile?.metadata.name);
    
    //             fs.unlinkSync(res.locals.file_location);
    //             fs.rmdirSync(res.locals.file_location);
    
    //             if (student?.dataValues.has_submitted) {
    //                 res.status(200).send(submission.id);
    //             }
    //             else {
    //                 student?.set({has_submitted: true});
    //                 student?.save().then(studentResponse => {
    //                     res.status(200).send(submission.id);
    //                 }).catch(error => {
    //                     console.log(error.message);
    //                     res.status(500).send("Server error.");
    //                 });
    //             }
    //         }).catch(error => {
    //             console.log(error.message);
    //             res.status(500).send("Server error.");
    //         });
    //     }
    // });
}

export default uploadThesis;