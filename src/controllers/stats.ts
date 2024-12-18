import { redis, redisTTL } from "../app.js";
import { TryCatch } from "../middleware/error.js";
import { Order } from "../models/order.js";
import { Product } from "../models/product.js";
import { User } from "../models/user.js";
import { calculatePercentage, getChartData, getInventories } from "../utils/features.js";



export const getDashboardStats = TryCatch(async (req,res,next) => {

   let stats;

   const key = "admin-stats"

   stats = await redis.get(key);

   if(stats) 
    stats = JSON.parse(stats);
   else {

    const today = new Date();
    const sixMonthAgo = new Date();
    sixMonthAgo.setMonth(sixMonthAgo.getMonth() - 6);

    const thisMonth = {
        start: new Date(today.getFullYear(),today.getMonth(),1),
        end: today
    }

    const lastMonth = {
        start: new Date(today.getFullYear(),today.getMonth() - 1,1),
        end: new Date(today.getFullYear(),today.getMonth() ,0)
    }

    

    const thisMonthProductsPromise =  Product.find({
        createdAt: {
            $gte: thisMonth.start,
            $lte: thisMonth.end
        }
    });

    const lastMonthProductsPromise =  Product.find({
        createdAt: {
            $gte: lastMonth.start,
            $lte: lastMonth.end
        }
    });

    const thisMonthUsersPromise =  User.find({
        createdAt: {
            $gte: thisMonth.start,
            $lte: thisMonth.end
        }
    });

    const lastMonthUsersPromise =  User.find({
        createdAt: {
            $gte: lastMonth.start,
            $lte: lastMonth.end
        }
    });

    const thisMonthOrdersPromise =  Order.find({
        createdAt: {
            $gte: thisMonth.start,
            $lte: thisMonth.end
        }
    });

    const lastMonthOrdersPromise =  Order.find({
        createdAt: {
            $gte: lastMonth.start,
            $lte: lastMonth.end
        }
    });

    const lastSixMonthOrdersPromise =  Order.find({
        createdAt: {
            $gte: sixMonthAgo,
            $lte: today
        }
    });

    const latestTransactionsPromise = Order.find({}).select(["orderItems","discount","total","status"]).limit(4)

    const [
        thisMonthProducts,
        thisMonthUsers,
        thisMonthOrders,
        lastMonthProducts,
        lastMonthUsers,
        lastMonthOrders,
        productsCount,
        usersCount,
        allOrders,
        lastSixMonthOrders,
        categories,
        femaleCount,
        latestTransactions
    ] = await Promise.all([
        thisMonthProductsPromise,
        thisMonthUsersPromise,
        thisMonthOrdersPromise,
        lastMonthProductsPromise,
        lastMonthUsersPromise,
        lastMonthOrdersPromise,
        Product.countDocuments(),
        User.countDocuments(),
        Order.find({}).select("total"),
        lastSixMonthOrdersPromise,
        Product.distinct("category"),
        User.countDocuments({ gender: "female"}),
        latestTransactionsPromise
       
    ]);

    const thisMonthRevenue = thisMonthOrders.reduce(
        (total, order) => total + (order.total || 0),
        0
    );

    const lastMonthRevenue = lastMonthOrders.reduce(
        (total, order) => total + (order.total || 0),
        0
    );

    const ChangePercentage = {
        revenue: calculatePercentage(
            thisMonthRevenue,
            lastMonthRevenue
        ),
        product: calculatePercentage(
            thisMonthProducts.length,
            lastMonthProducts.length
        ),
        user: calculatePercentage(
            thisMonthUsers.length,
            lastMonthUsers.length
        ),
        order: calculatePercentage(
            thisMonthOrders.length,
            lastMonthOrders.length
        )
    };

    const revenue = allOrders.reduce(
        (total, order) => total + (order.total || 0),
        0
    );

    const count = {
        revenue,
        user: usersCount,
        product: productsCount,
        order: allOrders.length,
    };

    const orderMonthCounts = getChartData({
        length: 6,
        today,
        docArr: lastSixMonthOrders,
    })
    const orderMonthlyRevenue = getChartData({
        length: 6,
        today,
        docArr: lastSixMonthOrders,
        property: "total",
    })

   const categoryCount = await getInventories({categories,productsCount});

   

   const userRatio = {
    male: usersCount - femaleCount,
    female: femaleCount
   }

   const modifiedLatestTransactions = latestTransactions.map((i) => ({
    _id: i._id,
    discount: i.discount,
    amount: i.total,
    quantity: i.orderItems.length,
    status: i.status,
  }));


   

    stats ={
        categoryCount,
        ChangePercentage,
        count,
        chart:{
            order: orderMonthCounts,
            revenue:orderMonthlyRevenue
        },
        userRatio,
        latestTransaction: modifiedLatestTransactions
    };

    await redis.setex(key,redisTTL,JSON.stringify(stats));

}

   return res.status(200).json({
    success: true,
    stats
   })

});

export const getPieCharts = TryCatch(async (req,res,next) => {

    let charts;

    const key = "admin-pie-charts";

    charts = await redis.get(key);

    if(charts) 
        charts = JSON.parse(charts);
    else{

    const allOrdersPromise =  Order.find({}).select([
        "total",
        "discount",
        "subtotal",
        "tax",
        "shippingCharges"
    ]);


        const [
            processingOrder,
            shippedOrder,
            deliveredOrder,
            categories,
            productsCount,
            productsOutOfstock,
            allOrders,
            allUsers,
            adminUsers,
            customers
        ] = await Promise.all([
            Order.countDocuments({ status: "Processing"}),
            Order.countDocuments({ status: "Sjipped"}),
            Order.countDocuments({ status: "Delivered"}),
            Product.distinct("category"),
            Product.countDocuments(),
            Product.countDocuments({stock:0}),
            allOrdersPromise,
            User.find({}).select(["dob"]),
            User.countDocuments({ role: "admin"}),
            User.countDocuments({ role: "user"})       
        ]);

        const orderFullfillment = {
            processing: processingOrder,
            shipped: shippedOrder,
            delivered: deliveredOrder
        };

        const productCategories = await getInventories({
            categories,
            productsCount
        });

        const stockAvailability = {
            inStock: productsCount - productsOutOfstock,
            outOfStock: productsOutOfstock
        }

        const grossIncome = allOrders.reduce((prev,order) => prev+(order.total || 0),0);

        const discount = allOrders.reduce((prev,order) => prev+(order.discount || 0),0);

        const productionCost = allOrders.reduce((prev,order) => prev+(order.shippingCharges || 0),0);

        const burnt = allOrders.reduce((prev,order) => prev+(order.tax || 0),0);

        const marketingCost = Math.round(grossIncome * (30 / 100));

        const netMargin = grossIncome - discount - productionCost - burnt - marketingCost;

        const revenueDistribution = {
            netMargin,
            discount,
            productionCost,
            burnt,
            marketingCost
        }

        const adminCustomer = {
            admin: adminUsers,
            customer: customers
        }

        const usersAgeGroup = {
             teen: allUsers.filter(i=> i.age < 20).length,
             adult:allUsers.filter(i=> i.age >= 20 && i.age < 40).length,
             old: allUsers.filter(i=> i.age >= 40).length,
        } 


        charts ={
            orderFullfillment,
            productCategories,
            stockAvailability,
            revenueDistribution,
            adminCustomer,
            usersAgeGroup
        };

        await redis.setex(key,redisTTL,JSON.stringify(charts));
      
    }

    return res.status(200).json({
        success: true,
        charts
    })
});

export const getBarCharts = TryCatch(async (req,res,next) => {
    let charts;
    const key = "admin-bar-charts";

    charts = await redis.get(key);

    if(charts) 
        charts = JSON.parse(charts);
    else{
        
        const today = new Date();

        const sixMonthAgo = new Date();
        sixMonthAgo.setMonth(sixMonthAgo.getMonth() - 6);

        const tewelveMonthAgo = new Date();
        tewelveMonthAgo.setMonth(tewelveMonthAgo.getMonth() - 12);

        const lastSixMonthProductsPromise =  Product.find({
            createdAt: {
                $gte: sixMonthAgo,
                $lte: today
            }
        }).select("createdAt");
        const lastSixMonthUsersPromise =  User.find({
            createdAt: {
                $gte: sixMonthAgo,
                $lte: today
            }
        }).select("createdAt");
        
        const lastTwelveMonthOrdersPromise =  Order.find({
            createdAt: {
                $gte: tewelveMonthAgo,
                $lte: today
            }
        }).select("createdAt");

        const [
            products,
            users,
            orders
        ] = await Promise.all([
            lastSixMonthProductsPromise,
            lastSixMonthUsersPromise,
            lastTwelveMonthOrdersPromise
        ]);
         

        const productCounts = getChartData({length: 6, today, docArr: products });
        const usersCounts = getChartData({ length: 6, today, docArr: users });
        const ordersCounts = getChartData({ length: 12, today, docArr: orders });





        charts = {
            users: usersCounts,
            products: productCounts,
            orders: ordersCounts
        }
        await redis.setex(key,redisTTL,JSON.stringify(charts));
    }

    return res.status(200).json({
        success: true,
        charts
    })

});

export const getLineCharts = TryCatch(async (req,res,next) => {
    let charts;
    const key = "admin-line-charts";

    charts = await redis.get(key);

    if(charts)
        charts = JSON.parse(charts);
    else{
        const today = new Date();

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const baseQuery = {
      createdAt: {
        $gte: twelveMonthsAgo,
        $lte: today,
      },
    };

    const [products, users, orders] = await Promise.all([
      Product.find(baseQuery).select("createdAt"),
      User.find(baseQuery).select("createdAt"),
      Order.find(baseQuery).select(["createdAt", "discount", "total"]),
    ]);

    const productCounts = getChartData({ length: 12, today, docArr: products });
    const usersCounts = getChartData({ length: 12, today, docArr: users });
    const discount = getChartData({
      length: 12,
      today,
      docArr: orders,
      property: "discount",
    });
    const revenue = getChartData({
      length: 12,
      today,
      docArr: orders,
      property: "total",
    });

    charts = {
      users: usersCounts,
      products: productCounts,
      discount,
      revenue,
    };

        await redis.setex(key,redisTTL,JSON.stringify(charts));

    }

    return res.status(200).json({
        success: true,
        charts
    })

});