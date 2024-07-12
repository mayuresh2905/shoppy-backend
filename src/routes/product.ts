import express from "express";
import { adminOnly } from "../middleware/auth.js";
import { singleUpload } from "../middleware/multer.js";
import { deleteProduct, getAdminProducts, getAllCategories, getAllProducts, getLatestProducts, getSingleProduct, newProduct, updateProduct } from "../controllers/product.js";

const app = express.Router();

//Route(Creating New Product) - /api/v1/product/new
app.post("/new",adminOnly,singleUpload,newProduct);

//Route(To get all Products with filters) - /api/v1/product/all
app.get("/all",getAllProducts);

//Route(To get last 10 Product) - /api/v1/product/latest
app.get("/latest",getLatestProducts);

//Route(To get distinct categories) - /api/v1/product/new
app.get("/categories",getAllCategories);

//Route(To get all the product by admin) - /api/v1/product/admin-product
app.get("/admin-products",adminOnly,getAdminProducts);

// To get, update, delete Product
app
   .route("/:id")
   .get(getSingleProduct)
   .put(adminOnly,singleUpload,updateProduct)
   .delete(adminOnly,deleteProduct);








export default app;