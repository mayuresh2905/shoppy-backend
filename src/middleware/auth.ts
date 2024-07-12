import { User } from "../models/user.js";
import ErrorHandler from "../utils/utility-class.js";
import { TryCatch } from "./error.js";

//Middlware to make sure only admin is allowed
export const adminOnly = TryCatch( async (req,res,next) => {
     
    const { id } = req.query;

    if(!id) return next(new ErrorHandler("Please login first!!",401));

    const user = await User.findById(id);

    if (!user) return next(new ErrorHandler("You have not been registered as authorized user.",401));

    if (user.role !== "admin") return next(new ErrorHandler("Access to admin dashboard privilages not been granted !!",401));

    next();
    

});