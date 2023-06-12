import { Request, Response } from "express";
import Thesis from "../../database/Thesis";
import User from "../../database/User";
import { Model } from "sequelize";

// const getThesisInfo = async (req: Request, res: Response) => {
//     const studentId: string = req.body.student_id.toUpperCase();
//     const thesisId: string = req.body.thesis_id;

//     const user: Model | null = await User.findOne({where: {id: studentId}});

//     if (!user) {
//         res.status(400).send("Student not found.");
//     }
//     else {
//         const thesisInfo: {[key: string]: string} = {};
//         thesisInfo["full_name"] = user.dataValues.full_name;
//         thesisInfo["student_id"] = user.dataValues.id;
//         const thesis = await Thesis.findOne({where: {id: thesisId}});

//         if (!thesis) {
//             res.status(400).send("Thesis not found.");
//         }
//         else {
//             thesisInfo["thesis_name"] = thesis.dataValues.thesis_name;
//             thesisInfo["submitted_time"] = thesis.dataValues.submitted_time;

//             res.status(200).send(thesisInfo);
//         }
//     }
// }

const getThesisInfo = async (req: Request, res: Response) => {
    const thesisId: string = req.body.thesis_id;

    const thesis: Model | null = await Thesis.findOne({where: {id: thesisId}});

    if (!thesis) {
        res.status(400).send("Thesis not found.");
    }
    else {
        const user: Model | null = await User.findOne({where: {id: thesis?.dataValues.student_id}});

        const thesisInfo: {[key: string]: string} = {};

        thesisInfo["full_name"] = user?.dataValues.full_name;
        thesisInfo["student_id"] = user?.dataValues.id;

        thesisInfo["thesis_name"] = thesis?.dataValues.thesis_name;
        thesisInfo["submitted_time"] = thesis?.dataValues.submitted_time;

        res.status(200).send(thesisInfo);
    }
}

export default getThesisInfo;