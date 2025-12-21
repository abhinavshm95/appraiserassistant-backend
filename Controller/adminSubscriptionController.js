const UserSubscription = require("../model/UserSubscription");
const User = require("../model/User");
const StripeProduct = require("../model/StripeProduct");
const StripePrice = require("../model/StripePrice");

const getAllSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 100, status, plan } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (status && status !== "all") {
      filter.status = status;
    }
    if (plan && plan !== "all") {
      filter.stripePriceId = plan;
    }
    // Get subscriptions with user data
    // Filter out admins and managers (who shouldn't have individual subscriptions in this view)
    const excludedRoles = ["admin", "manager"];
    const excludedUsers = await User.find({ role: { $in: excludedRoles } }, "_id");
    const excludedUserIds = excludedUsers.map((u) => u._id);

    filter.userId = { $nin: excludedUserIds };
    // Get subscriptions with user data
    const subscriptions = await UserSubscription.find(filter)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await UserSubscription.countDocuments(filter);

    // Get all prices to map price IDs to plan details
    const prices = await StripePrice.find();
    const priceMap = {};
    prices.forEach((price) => {
      priceMap[price.stripePriceId] = {
        interval: price.interval,
        intervalCount: price.intervalCount,
        amount: price.unitAmount / 100, // Convert from cents
      };
    });

    // Fetch subscription codes for these users to identify prepaid subscriptions
    const BulkSubscriptionCode = require("../model/BulkSubscriptionCode");
    const userIds = subscriptions.map((s) => s.userId._id);
    const codes = await BulkSubscriptionCode.find({
      redeemedBy: { $in: userIds },
      status: "redeemed", // We only care about redeemed codes
    })
      .sort({ redeemedAt: -1 }) // Get latest first
      .populate("purchaseId");

    // Create map of userId -> latest code
    const userCodeMap = {};
    codes.forEach((code) => {
      // Since we sort by redeemedAt desc, the first one we see is the latest
      if (!userCodeMap[code.redeemedBy.toString()]) {
        userCodeMap[code.redeemedBy.toString()] = code;
      }
    });

    // Transform data to match frontend structure
    const transformedSubscriptions = subscriptions.map((sub) => {
      const user = sub.userId || {};
      const priceInfo = priceMap[sub.stripePriceId] || {};

      // Determine source and payment method
      let source = "stripe";
      let paymentMethod = "stripe";
      let prepaidKey = null;

      if (!sub.stripeSubscriptionId) {
        // likely a key based subscription
        const uniqueUserId = user._id?.toString();
        const code = userCodeMap[uniqueUserId];

        if (code) {
          paymentMethod = "prepaid_key";
          prepaidKey = code.code;

          if (code.purchaseId && code.purchaseId.totalAmount === 0) {
            source = "admin";
          } else {
            source = "purchased";
          }
        }
      }

      // Determine plan type
      let planType = "monthly";
      if (priceInfo.interval === "year") {
        planType = priceInfo.intervalCount === 2 ? "2_years" : "1_year";
      }

      return {
        id: sub._id.toString(),
        userId: user._id?.toString() || "",
        userName: user.name || "Unknown User",
        userEmail: user.email || "No email",
        plan: planType,
        status: sub.status,
        paymentMethod,
        source, // New field
        prepaidKey, // New field
        amount: priceInfo.amount || 0,
        startDate: sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toISOString().split("T")[0] : "",
        endDate: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString().split("T")[0] : "",
        autoRenew: !sub.cancelAtPeriodEnd,
        lastPayment: sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toISOString().split("T")[0] : "",
        stripeSubscriptionId: sub.stripeSubscriptionId,
        stripeCustomerId: sub.stripeCustomerId,
      };
    });

    res.status(200).json({
      statusCode: 200,
      message: "Subscriptions retrieved successfully",
      data: {
        subscriptions: transformedSubscriptions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({
      statusCode: 500,
      message: "Failed to fetch subscriptions",
      error: error.message,
    });
  }
};

const getSubscriptionStats = async (req, res) => {
  try {
    // Get all subscriptions
    // Filter out admins and managers
    const excludedRoles = ["admin", "manager"];
    const excludedUsers = await User.find({ role: { $in: excludedRoles } }, "_id");
    const excludedUserIds = excludedUsers.map((u) => u._id);

    const allSubscriptions = await UserSubscription.find({ userId: { $nin: excludedUserIds } }).populate(
      "userId",
      "name email",
    );

    // Get all prices for amount mapping
    const prices = await StripePrice.find();
    const priceMap = {};
    prices.forEach((price) => {
      priceMap[price.stripePriceId] = {
        interval: price.interval,
        intervalCount: price.intervalCount,
        amount: price.unitAmount / 100,
      };
    });

    // Calculate stats
    const total = allSubscriptions.length;
    const active = allSubscriptions.filter((s) => s.status === "active").length;

    // Calculate monthly revenue (from monthly plans only)
    const monthlyRevenue = allSubscriptions
      .filter((s) => {
        if (s.status !== "active") return false;
        const priceInfo = priceMap[s.stripePriceId];
        return priceInfo && priceInfo.interval === "month";
      })
      .reduce((acc, s) => {
        const priceInfo = priceMap[s.stripePriceId];
        return acc + (priceInfo?.amount || 0);
      }, 0);

    // Calculate total active value (all active subscriptions)
    const totalRevenue = allSubscriptions
      .filter((s) => s.status === "active")
      .reduce((acc, s) => {
        const priceInfo = priceMap[s.stripePriceId];
        return acc + (priceInfo?.amount || 0);
      }, 0);

    res.status(200).json({
      statusCode: 200,
      message: "Stats retrieved successfully",
      data: {
        total,
        active,
        monthlyRevenue,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error("Error fetching subscription stats:", error);
    res.status(500).json({
      statusCode: 500,
      message: "Failed to fetch subscription stats",
      error: error.message,
    });
  }
};

const getSubscriptionById = async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = await UserSubscription.findById(id).populate("userId", "name email");

    if (!subscription) {
      return res.status(404).json({
        statusCode: 404,
        message: "Subscription not found",
      });
    }

    // Get price info
    const price = await StripePrice.findOne({
      stripePriceId: subscription.stripePriceId,
    });

    const priceInfo = price
      ? {
          interval: price.interval,
          intervalCount: price.intervalCount,
          amount: price.unitAmount / 100,
        }
      : {};

    // Determine plan type
    let planType = "monthly";
    if (priceInfo.interval === "year") {
      planType = priceInfo.intervalCount === 2 ? "2_years" : "1_year";
    }

    const user = subscription.userId || {};

    const transformedSubscription = {
      id: subscription._id.toString(),
      userId: user._id?.toString() || "",
      userName: user.name || "Unknown User",
      userEmail: user.email || "No email",
      plan: planType,
      status: subscription.status,
      paymentMethod: "stripe",
      amount: priceInfo.amount || 0,
      startDate: subscription.currentPeriodStart
        ? new Date(subscription.currentPeriodStart).toISOString().split("T")[0]
        : "",
      endDate: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toISOString().split("T")[0] : "",
      autoRenew: !subscription.cancelAtPeriodEnd,
      lastPayment: subscription.currentPeriodStart
        ? new Date(subscription.currentPeriodStart).toISOString().split("T")[0]
        : "",
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      stripeCustomerId: subscription.stripeCustomerId,
    };

    res.status(200).json({
      statusCode: 200,
      message: "Subscription retrieved successfully",
      data: transformedSubscription,
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    res.status(500).json({
      statusCode: 500,
      message: "Failed to fetch subscription",
      error: error.message,
    });
  }
};

module.exports = {
  getAllSubscriptions,
  getSubscriptionStats,
  getSubscriptionById,
};
