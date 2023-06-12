import { Request, Response, NextFunction } from "express";
import multer, { FileFilterCallback } from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";

type DestinationCallback = (error: Error | null, destination: string) => void;
type FileNameCallback = (error: Error | null, filename: string) => void;

const maxFileSize: number = 31457280; // 3omb
let fileName: string;
let id: string;
// let version: number;
let destinationPath: string;

// const storage = multer.diskStorage({
//     destination: async (
//         req: Request, 
//         file: Express.Multer.File, 
//         callback: DestinationCallback
//     ) => {
//         const submissions: Model[] | null = await Thesis.findAll({where: {student_id: req.body.student_id.toUpperCase()}});
//         version = 1;

//         if (submissions.length > 0) {
//             const lastItemIndex: number = submissions.length - 1;
//             version =  submissions[lastItemIndex].dataValues.version + 1;
//         }

//         id = uuidv4();
        
//         destinationPath = path.join(process.env.APP_ROOT_PATH!, `${req.body.student_id.toLowerCase()}/version-${version}-${id}`);
//         console.log("destination path = " + destinationPath);
//         fs.mkdirSync(destinationPath, {recursive: true});

//         callback(null, destinationPath);
//     },
//     filename: (
//         req: Request, 
//         file: Express.Multer.File, 
//         callback: FileNameCallback
//     ) => {
//         const originalName: string[] = file.originalname.split(".");

//         const name: string = originalName[0];
//         const extension: string = originalName[1];
//         const uniqueSuffix: string = Date.now() + "-" + Math.round(Math.random() * 1E9);

//         fileName = name + "-" + uniqueSuffix + "." + extension;
//         callback(null, fileName);
//     }
// });

// const fileFilter = (req: Request, file: Express.Multer.File, callback : FileFilterCallback) => {
//     const fileType: string = ".pdf";
//     if (!file.originalname.includes(fileType)) {
//         return callback(new Error("Incorrect file type."));
//     }

//     const fileSize = parseInt(req.headers["content-length"]!);
//     if (fileSize > maxFileSize) {
//         return callback(new Error("File exceeds limit."));
//     }
    
//     callback(null, true);
// }

// export const uploadFile = async (req: Request, res: Response, next: NextFunction) => {
//     const upload = multer({ 
//         storage: storage,
//         limits: {
//             fileSize: maxFileSize
//         },
//         fileFilter: fileFilter
//     }).single("file");

//     upload(req, res, async (err: any) => {
//         if (err) {
//             const message: string = err.message;
//             if (message === "Incorrect file type.") {
//                 res.status(422).send(message);
//             }
//             else if (message === "File exceeds limit.") {
//                 res.status(413).send(message);
//             }
//         }
//         else {
//             res.locals.id = id;
//             res.locals.version = version;
//             res.locals.file_location = destinationPath.replace(/\\/g, "/");;
//             res.locals.file_name = fileName;
//             next();
//         }
//     });
// }

const storage = multer.diskStorage({
    destination: async (
        req: Request, 
        file: Express.Multer.File, 
        callback: DestinationCallback
    ) => {
        id = uuidv4();

        destinationPath = path.join(process.env.ROOT_DIR!, process.env.APP_NAME!, "files");
        
        callback(null,  destinationPath);
    },
    filename: (
        req: Request, 
        file: Express.Multer.File, 
        callback: FileNameCallback
    ) => {
        fileName = id;
        callback(null, fileName);
    }
});

const fileFilter = (req: Request, file: Express.Multer.File, callback : FileFilterCallback) => {
    const fileType: string = ".pdf";
    if (!file.originalname.includes(fileType)) {
        return callback(new Error("Incorrect file type."));
    }

    const fileSize = parseInt(req.headers["content-length"]!);
    if (fileSize > maxFileSize) {
        return callback(new Error("File exceeds limit."));
    }
    
    callback(null, true);
}

export const uploadFile = async (req: Request, res: Response, next: NextFunction) => {
    const upload = multer({ 
        storage: storage,
        limits: {
            fileSize: maxFileSize
        },
        fileFilter: fileFilter
    }).single("file");

    upload(req, res, async (err: any) => {
        if (err) {
            const message: string = err.message;
            if (message === "Incorrect file type.") {
                res.status(422).send(message);
            }
            else if (message === "File exceeds limit.") {
                res.status(413).send(message);
            }
        }
        else {
            res.locals.id = id;
            //res.locals.version = version;
            res.locals.file_dir = destinationPath;
            res.locals.file_name = fileName;
            res.locals.file_location = path.join(destinationPath, fileName);
            next();
        }
    });
}