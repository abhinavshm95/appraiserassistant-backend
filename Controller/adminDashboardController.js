const { user: User, userSubscription: UserSubscription, transaction: Transaction } = require("../model");
const AdminLog = require("../model/AdminLog");
const SearchLog = require("../model/SearchLog");
const Mongoose = require("mongoose");

exports.getDashboardStats = async (req, res, next) => {
  try {
    // Parallelize data fetching for performance
    const [
      totalUsers,
      newUsersToday,
      activeSubscriptions,
      monthlyRevenue,
      totalSearches,
      recentSignups,
      recentActivity,
    ] = await Promise.all([
      // 1. Total Users
      User.countDocuments({ role: "standard" }),

      // 2. New Users Today
      User.countDocuments({
        role: "standard",
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),

      // 3. Active Subscriptions
      UserSubscription.countDocuments({ status: { $in: ["active", "trialing"] } }),

      // 4. Monthly Revenue (Estimate from recent transactions + bulk purchases)
      Promise.all([
        Transaction.aggregate([
          {
            $match: {
              status: "succeeded",
              createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 30)) },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ]),
        // Also include BulkSubscriptionPurchases
        require("../model/BulkSubscriptionPurchase").aggregate([
          {
            $match: {
              status: "completed",
              createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 30)) },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$totalAmount" },
            },
          },
        ]),
      ]).then(([txResult, bulkResult]) => {
        const txTotal = txResult[0]?.total || 0;
        const bulkTotal = bulkResult[0]?.total || 0;
        return txTotal + bulkTotal;
      }),

      // 5. Total Searches (All time or last 30 days?) -> Let's show All Time for now
      SearchLog.countDocuments({}),

      // 6. Recent Signups (Last 5)
      User.find({ role: "standard" }).select("name email profilePicture createdAt").sort({ createdAt: -1 }).limit(5),

      // 7. Recent Admin Activity (Last 10)
      AdminLog.find({}).populate("adminId", "name email").sort({ createdAt: -1 }).limit(10),
    ]);

    return res.status(200).json({
      message: "Dashboard stats fetched successfully",
      data: {
        counts: {
          users: totalUsers,
          newUsers: newUsersToday,
          subscriptions: activeSubscriptions,
          revenue: monthlyRevenue, // In cents
          searches: totalSearches,
        },
        recentSignups,
        recentActivity,
      },
    });
  } catch (error) {
    next(error);
  }
};
