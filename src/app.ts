import express from "express";


//Importing Routes
import userRoute from './routes/user.js';
import productRoute from './routes/product.js';
import orderRoute from "./routes/order.js";
import paymentRoute from "./routes/payment.js";
import dashBoardRoute from "./routes/stats.js"


//Importing Utils
import { connectDB, connectRedis } from "./utils/features.js";

//Importing Middlewares
import { errorMiddleware } from "./middleware/error.js";

import { config } from "dotenv";
import morgan from 'morgan'
import Stripe from "stripe";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";

config({
    path:"./.env"
})




const app = express();
const port = process.env.PORT || 3000;
const stripeKey = process.env.STRIPE_KEY || "";
export const redisTTL = process.env.REDIS_TTL || 60 * 60 * 4;


connectDB(process.env.MONGO_URI || "");
export const redis = connectRedis(process.env.REDIS_URI || "");

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET,
});

export const stripe = new Stripe(stripeKey)

app.use(express.json());
app.use(morgan("dev"));
app.use(cors({
    origin: [process.env.CLIENT_URL!],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
}));


app.get("/",(req,res) => {
    res.send("API is Working with /api/v1");
})

//Using Routes
app.use("/api/v1/user",userRoute);
app.use("/api/v1/product",productRoute);
app.use("/api/v1/order",orderRoute);
app.use("/api/v1/payment",paymentRoute);
app.use("/api/v1/dashboard",dashBoardRoute);

//Acessing images from uploads folder
app.use("/uploads",express.static("uploads"));

//Using Middleware
app.use(errorMiddleware);




app.listen(port, () => {
    console.log(`Server is working on http://localhost:${port}`);   
})