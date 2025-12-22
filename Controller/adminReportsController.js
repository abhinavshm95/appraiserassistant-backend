const {
  userSubscription: UserSubscription,
  bulkSubscriptionCode: BulkSubscriptionCode,
  transaction: Transaction,
  user: User,
} = require("../model");
const AdminLog = require("../model/AdminLog");
const SearchLog = require("../model/SearchLog");
const Mongoose = require("mongoose");

// Get Active Subscriptions
exports.getActiveSubscriptions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const query = { status: { $in: ["active", "trialing"] } };

    const subscriptions = await UserSubscription.find(query)
      .populate("userId", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await UserSubscription.countDocuments(query);

    return res.status(200).json({
      message: "Active subscriptions fetched successfully",
      data: subscriptions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Key Generation History
exports.getKeyGenerationHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const codes = await BulkSubscriptionCode.find({})
      .populate("adminId", "name email")
      .populate("redeemedBy", "name email")
      .populate("purchaseId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await BulkSubscriptionCode.countDocuments({});

    return res.status(200).json({
      message: "Key generation history fetched successfully",
      data: codes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Payment History
exports.getPaymentHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Filter for relevant transaction types (subscription creation, renewal)
    const query = {
      type: { $in: ["subscription_created", "subscription_renewed", "payment_succeeded"] },
      status: "succeeded",
    };

    const transactions = await Transaction.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments(query);

    return res.status(200).json({
      message: "Payment history fetched successfully",
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Admin Logs
exports.getAdminLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const logs = await AdminLog.find({})
      .populate("adminId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AdminLog.countDocuments({});

    return res.status(200).json({
      message: "Admin logs fetched successfully",
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Most Frequently Used Queries
exports.getFrequentQueries = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;

    // This aggregation groups by query content to find most common searches
    // Simplification: We will group by the stringified query object to count duplicates
    // Note: For large datasets, this aggregation should be optimized or pre-calculated
    const frequentQueries = await SearchLog.aggregate([
      {
        $group: {
          _id: {
            endpoint: "$endpoint",
            query: "$query", // This might need refinement if query order varies
          },
          count: { $sum: 1 },
          lastSearchedAt: { $max: "$createdAt" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    return res.status(200).json({
      message: "Frequent queries fetched successfully",
      data: frequentQueries,
    });
  } catch (error) {
    next(error);
  }
};
