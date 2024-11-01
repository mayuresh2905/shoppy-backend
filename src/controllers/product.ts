import { NextFunction, Request, Response } from "express";
import { Product } from "../models/product.js";
import { NewProductRequestBody, SearchRequestQuery, BaseQuery } from "../types/types.js";
import { TryCatch } from "../middleware/error.js";
import ErrorHandler from "../utils/utility-class.js";
import { redis, redisTTL } from "../app.js";
import { deleteFromCloudinary, findAverageRatings, invalidatesCache, uploadToCloudinary } from "../utils/features.js";
import { User } from "../models/user.js";
import { Review } from "../models/review.js";
import { Types } from 'mongoose'
// import { faker } from "@faker-js/faker";




// Revalidate on New,Update,Delete Product & on New Order
export const getLatestProducts = TryCatch(
    async (req, res, next) => {
       
        let products;

        products = await redis.get("latest-products");
        
        if(products) {
            products = JSON.parse(products)
        } else {
            products = await Product.find({}).sort({createdAt: -1}).limit(5);
            await redis.setex("latest-products",redisTTL,JSON.stringify(products));
        }
       
        return res.status(201).json({
            success:true,
            products,
        })

      
    }
);

// Revalidate on New,Update,Delete Product & on New Order
export const getAllCategories = TryCatch(
    async (req:Request<{},{}, NewProductRequestBody>, res:Response, next: NextFunction) => {
       
       let categories;

       categories = await redis.get("categories");

       if(categories){
         categories = JSON.parse(categories)
       } else {
        categories = await Product.distinct("category");
        await redis.setex("categories",redisTTL, JSON.stringify(categories));
       }
       
        return res.status(201).json({
            success:true,
            categories      
        })

      
    }
);

// Revalidate on New,Update,Delete Product & on New Order
export const getAdminProducts = TryCatch(
    async (req:Request<{},{}, NewProductRequestBody>, res:Response, next: NextFunction) => {
       let products;

       products = await redis.get("all-products");

       if(products){
           products = JSON.parse(products);
       } else {
        products = await Product.find({});
        await redis.setex("all-products",redisTTL,JSON.stringify(products))
       }

        return res.status(201).json({
            success:true,
            products,
        })

      
    }
);

export const getSingleProduct = TryCatch(
    async (req, res, next) => {

        let product;
        const id = req.params.id;

        product = await redis.get(`product-${id}`);

        if (product) {
            product =JSON.parse(product)
            
        } else {
            product = await Product.findById(id);

            if(!product) return next(new ErrorHandler("Product Not Found", 404));

            await redis.setex((`product-${id}`),redisTTL,JSON.stringify(product))
        }
       
       

        return res.status(201).json({
            success:true,
            product,
        })

      
    }
);

export const newProduct = TryCatch(
    async (req:Request<{},{}, NewProductRequestBody>, res:Response, next: NextFunction) => {
       
        const { name, price, stock, category, description } = req.body;

        const photos = req.files as Express.Multer.File[] | undefined;

        if(!photos) return next(new ErrorHandler("Please add Photo",400));

        if(photos.length < 1) return next(new ErrorHandler("Please add atleast one photo",400));

        if(photos.length > 5) return next(new ErrorHandler("Ypu can only upload 5 Photos",400));

        if( !name || !price || !stock || !category || !description) { 
            return next(new ErrorHandler("Please enter All fields",400));
        }

        //Uploading photos in cloudinary
        const photosURL = await uploadToCloudinary(photos);

        await Product.create({
            name,
            price,
            description,
            stock,
            category: category.toLowerCase(),
            photos: photosURL,
        });

        await invalidatesCache({ product: true, admin: true});

        return res.status(201).json({
            success:true,
            message: "Product Created Successfully"
        })

      
    }
);

export const updateProduct = TryCatch(
    async (req, res, next) => {
        const { id } =req.params;
       
        const { name, price, stock, category, description } = req.body;

        const photos = req.files as Express.Multer.File[] | undefined;
        
        const product = await Product.findById(id);

        if(!product) return next(new ErrorHandler("Invalid Product Id", 404));

        if (photos && photos.length > 0) {
            const photosURL = await uploadToCloudinary(photos);
        
            const ids = product.photos.map((photo) => photo.public_id);
        
            await deleteFromCloudinary(ids);
        
            product.photos = photosURL as unknown as Types.DocumentArray<{ public_id: string; url: string }>;
     }

       if (name) product.name = name;
       if (price) product.price = price;
       if (stock) product.stock = stock;
       if (category) product.category = category;
       if (description) product.description = description;

       await product.save();

       await invalidatesCache({ product: true,productId:String(product._id),admin: true});

        return res.status(200).json({
            success:true,
            message: "Product Updated Successfully"
        })

      
    }
);

export const deleteProduct = TryCatch(
    async (req, res, next) => {
       
       const product = await Product.findById(req.params.id);

       if(!product) return next(new ErrorHandler("Product Not found", 404));

       const ids = product.photos.map((photo) => photo.public_id);

       await deleteFromCloudinary(ids);

       await product.deleteOne();

       await invalidatesCache({ product: true,productId:String(product._id),admin: true});

        return res.status(201).json({
            success:true,
            message: "Product Deleted Successfully",
        })

      
    }
);


export const getAllProducts = TryCatch(
    async (req:Request<{},{},{}, SearchRequestQuery>, res:Response, next: NextFunction) => {

        const {search, sort, category, price} = req.query;

        const page = Number(req.query.page) || 1;

        const key = `products-${search}-${sort}-${category}-${price}-${page}`;

        let products;
        let totalPage;

        const cachedData = await redis.get(key);

        if(cachedData) {
            const data = JSON.parse(cachedData);
            totalPage = data.totalPage;
            products = data.products;
        } else {
            
        const limit = Number(process.env.PRODUCT_PER_PAGE) || 8;
        
        const skip = (page-1) * limit;

        const baseQuery: BaseQuery = {}
        
        if(search) baseQuery.name = {
            $regex: search,
            $options:"i"
        };

        if(price) baseQuery.price = {
            $lte: Number(price),
        }

        if(category) baseQuery.category = category;

        const productsPromise =  Product.find(baseQuery)
        .sort(
            sort && {price: sort === "asc" ? 1 : -1} 
           ).limit(limit)
             .skip(skip)

        const [productsFetched,filteredOnlyProduct] = await Promise.all([
           productsPromise,
           Product.find(baseQuery)

        ]);

       products = productsFetched;
       totalPage = Math.ceil(filteredOnlyProduct.length / limit);

       await redis.setex(key,30, JSON.stringify({ products, totalPage}))
    }

        

        return res.status(201).json({
            success:true,
            products,
            totalPage
        })

      
    }
);

export const allReviewsOfProduct = TryCatch(async (req, res, next) => {

    let reviews;

    reviews = await redis.get(`reviews-${req.params.id}`);

    if(reviews) reviews = JSON.parse(reviews);
    else {
        reviews = await Review.find({
            product: req.params.id,
          }).populate("user", "name photo").sort({ updatedAt: -1 });

        await redis.setex(`review-${req.params.id}`,redisTTL, JSON.stringify(reviews));
    }
    
    return res.status(200).json({
      success: true,
      reviews,
    });
});

export const newReview = TryCatch(async (req, res, next) => {

       const user = await User.findById(req.query.id);

       if (!user) return next(new ErrorHandler("Not Logged In", 404));

       const product = await Product.findById(req.params.id);

       if(!product) return next(new ErrorHandler("Product Not found", 404));

       const {comment,rating} = req.body;

       const alreadyReviewed = await Review.findOne({
        user: user._id,
        product: product._id,
      });

       if (alreadyReviewed) {
        alreadyReviewed.comment = comment;
        alreadyReviewed.rating = rating;

        await alreadyReviewed.save();
        
       } else {
         await Review.create({
            comment,
            rating,
            user: user._id,
            product: product._id
         })
       }

       const { ratings, numOfReviews} = await findAverageRatings(product._id);

       product.ratings = ratings;
       product.numOfReviews = numOfReviews;

       await product.save();

       await invalidatesCache({ product: true,productId:String(product._id),admin: true,review:true});

        return res.status(alreadyReviewed ? 200 : 201).json({
            success:true,
            message: alreadyReviewed ? "Review Update" : "Review Added",
        })

      
    }
);


export const deleteReview = TryCatch(async (req, res, next) => {
  const user = await User.findById(req.query.id);

  if (!user) return next(new ErrorHandler("Not Logged In", 404));

  const review = await Review.findById(req.params.id);
  if (!review) return next(new ErrorHandler("Review Not Found", 404));

  const isAuthenticUser = review.user.toString() === user._id.toString();

  if (!isAuthenticUser) return next(new ErrorHandler("Not Authorized", 401));

  await review.deleteOne();

  const product = await Product.findById(review.product);

  if (!product) return next(new ErrorHandler("Product Not Found", 404));

  const { ratings, numOfReviews} = await findAverageRatings(product._id);

  product.ratings = ratings;
  product.numOfReviews = numOfReviews;

  await product.save();

  await invalidatesCache({
    product: true,
    productId: String(product._id),
    admin: true,
  });

  return res.status(200).json({
    success: true,
    message: "Review Deleted",
  });
});
// const generateRandomProducts = async (count: number = 10) => {
//   const products = [];

//   for (let i = 0; i < count; i++) {
//     const product = {
//       name: faker.commerce.productName(),
//       photo: "uploads\\a7323d0a-e102-4ba7-83a2-c8c061ef398d.jfif",
//       price: faker.commerce.price({ min: 1500, max: 80000, dec: 0 }),
//       stock: faker.commerce.price({ min: 0, max: 100, dec: 0 }),
//       category: faker.commerce.department(),
//       createdAt: new Date(faker.date.past()),
//       updatedAt: new Date(faker.date.recent()),
//       __v: 0,
//     };

//     products.push(product);
//   }

//   await Product.create(products);

//   console.log({ succecss: true });
// };

// generateRandomProducts(40);

// const deleteRandomsProducts = async (count: number = 10) => {
//   const products = await Product.find({}).skip(2);

//   for (let i = 0; i < products.length; i++) {
//     const product = products[i];
//     await product.deleteOne();
//   }

//   console.log({ succecss: true });
// };

// deleteRandomsProducts(38);