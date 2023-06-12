import { DataTypes } from "sequelize";
import db from "./config";
import User from "./User";
import UserType from "./UserType";

const Student = db.sequelize.define("Student", {
    student_id: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        references: {
            model: User,
            key: "id"
        }
    },
    has_submitted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
}, {
    tableName: "student"
});

User.hasOne(Student, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    foreignKey: "student_id"
});

Student.belongsTo(User, {foreignKey: "student_id"});

export default Student;