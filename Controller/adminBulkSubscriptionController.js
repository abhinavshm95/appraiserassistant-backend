const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Model = require("../model/index");
const universalFunction = require("../universalFunction/universalFunction");
const code = require("../statusCode/index");
const { logAdminAction } = require("../Utils/adminLogger");

/**
 * Get subscription duration in days based on price interval
 */
const getSubscriptionDurationDays = (interval, intervalCount) => {
  switch (interval) {
    case "day":
      return intervalCount;
    case "week":
      return intervalCount * 7;
    case "month":
      return intervalCount * 30;
    case "year":
      return intervalCount * 365;
    default:
      return 30; // Default to 30 days
  }
};

/**
 * Create a Stripe checkout session for bulk subscription purchase
 * Manager/Admin only - one-time payment for multiple subscription codes
 */
const createBulkCheckoutSession = async (req, res, next) => {
  try {
    const { priceId, quantity } = req.body;
    const admin = req.user;

    if (!priceId) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        "Price ID is required",
      );
    }

    if (!quantity || quantity < 1 || quantity > 100) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        "Quantity must be between 1 and 100",
      );
    }

    // Verify the price exists and is active
    const priceRecord = await Model.stripePrice.findOne({ stripePriceId: priceId, active: true });
    if (!priceRecord) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        "Invalid or inactive price",
      );
    }

    // Get admin's Stripe customer ID from User model or create one
    let stripeCustomerId = admin.stripeCustomerId;

    if (!stripeCustomerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: admin.email,
        name: admin.name,
        metadata: {
          userId: admin._id.toString(),
          role: admin.role,
        },
      });
      stripeCustomerId = customer.id;

      // Store the customer ID on the User model
      await Model.user.findByIdAndUpdate(admin._id, { stripeCustomerId: stripeCustomerId });
    }

    // Calculate subscription duration based on the price interval
    const subscriptionDurationDays = getSubscriptionDurationDays(priceRecord.interval, priceRecord.intervalCount);

    // Create subscription checkout session (recurring billing)
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: quantity,
        },
      ],
      subscription_data: {
        metadata: {
          adminId: admin._id.toString(),
          type: "bulk_subscription_purchase",
          quantity: quantity.toString(),
          subscriptionDurationDays: subscriptionDurationDays.toString(),
          stripePriceId: priceId,
          stripeProductId: priceRecord.stripeProductId,
          unitAmount: priceRecord.unitAmount.toString(),
          currency: priceRecord.currency,
        },
      },
      success_url: `${
        process.env.ADMIN_URL || process.env.FRONTEND_URL
      }/bulk-subscriptions/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.ADMIN_URL || process.env.FRONTEND_URL}/bulk-subscriptions/cancel`,
      metadata: {
        adminId: admin._id.toString(),
        type: "bulk_subscription_purchase",
        quantity: quantity.toString(),
        subscriptionDurationDays: subscriptionDurationDays.toString(),
        stripePriceId: priceId,
        stripeProductId: priceRecord.stripeProductId,
        unitAmount: priceRecord.unitAmount.toString(),
        currency: priceRecord.currency,
      },
    });

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      "Bulk checkout session created successfully",
      { sessionId: session.id, url: session.url },
    );
  } catch (err) {
    console.error("Error creating bulk checkout session:", err);
    next(err);
  }
};

/**
 * Create admin generated subscription keys without payment
 * Admin/Manager only
 */
const createAdminSubscription = async (req, res, next) => {
  try {
    const { months, quantity } = req.body;
    const admin = req.user;

    if (!months || months < 1) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        "Duration in months is required and must be at least 1",
      );
    }

    if (!quantity || quantity < 1 || quantity > 100) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        "Quantity must be between 1 and 100",
      );
    }

    // Calculate subscription duration (approximate)
    const subscriptionDurationDays = months * 30;

    // Create the purchase record with 0 amount
    const purchase = await Model.bulkSubscriptionPurchase.create({
      adminId: admin._id,
      stripeCustomerId: admin.stripeCustomerId || "admin_generated",
      stripePriceId: "admin_custom_price",
      stripeProductId: "admin_custom_product",
      quantity: quantity,
      unitAmount: 0,
      totalAmount: 0, // Free for admin generated
      currency: "usd",
      status: "completed",
      subscriptionDurationDays: subscriptionDurationDays,
      codesGenerated: true,
      paidAt: new Date(),
      metadata: {
        generatedBy: "admin",
        adminId: admin._id.toString(),
        adminName: admin.name,
        customDurationMonths: months.toString(),
      },
    });

    // Generate codes
    const codes = await Model.bulkSubscriptionCode.generateUniqueCodes(quantity);

    // Save codes to database
    const codeDocs = codes.map((codeStr) => ({
      purchaseId: purchase._id,
      adminId: admin._id,
      code: codeStr,
      status: "available",
      stripePriceId: "admin_custom_price",
      stripeProductId: "admin_custom_product",
      subscriptionDurationDays: subscriptionDurationDays,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Codes valid for redemption for 1 year
    }));

    await Model.bulkSubscriptionCode.insertMany(codeDocs);

    // Log admin action
    await logAdminAction(
      admin._id,
      "Created Subscription Keys",
      {
        quantity: quantity,
        months: months,
        purchaseId: purchase._id,
      },
      req,
    );

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      "Subscription keys generated successfully",
      {
        purchaseId: purchase._id,
        quantity: quantity,
        months: months,
        codes: codes,
      },
    );
  } catch (err) {
    console.error("Error generating admin subscription keys:", err);
    next(err);
  }
};

const getBulkPurchases = async (req, res, next) => {
  try {
    const admin = req.user;
    const { page = 1, limit = 10, status } = req.query;

    const query = {};
    // If not super admin, only show own purchases
    if (admin.role !== "admin") {
      query.adminId = admin._id;
    }

    if (status && status !== "all") {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [purchases, total] = await Promise.all([
      Model.bulkSubscriptionPurchase
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("adminId", "name email")
        .lean(),
      Model.bulkSubscriptionPurchase.countDocuments(query),
    ]);

    // Get product details for each purchase
    const productIds = [...new Set(purchases.map((p) => p.stripeProductId))];
    const products = await Model.stripeProduct
      .find({
        stripeProductId: { $in: productIds },
      })
      .lean();
    const productMap = new Map(products.map((p) => [p.stripeProductId, p]));

    // Get code statistics for each purchase
    const purchaseIds = purchases.map((p) => p._id);
    const codeStats = await Model.bulkSubscriptionCode.aggregate([
      { $match: { purchaseId: { $in: purchaseIds } } },
      {
        $group: {
          _id: "$purchaseId",
          total: { $sum: 1 },
          available: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
          redeemed: { $sum: { $cond: [{ $eq: ["$status", "redeemed"] }, 1, 0] } },
          revoked: { $sum: { $cond: [{ $eq: ["$status", "revoked"] }, 1, 0] } },
          expired: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } },
        },
      },
    ]);
    const codeStatsMap = new Map(codeStats.map((s) => [s._id.toString(), s]));

    const purchasesWithDetails = purchases.map((purchase) => {
      const product = productMap.get(purchase.stripeProductId);
      const stats = codeStatsMap.get(purchase._id.toString()) || {
        total: 0,
        available: 0,
        redeemed: 0,
        revoked: 0,
        expired: 0,
      };

      return {
        id: purchase._id,
        manager: purchase.adminId
          ? {
              id: purchase.adminId._id,
              name: purchase.adminId.name,
              email: purchase.adminId.email,
            }
          : null,
        productName: product?.name || "Unknown Product",
        quantity: purchase.quantity,
        unitAmount: purchase.unitAmount / 100, // Convert from cents
        totalAmount: purchase.totalAmount / 100,
        currency: purchase.currency,
        status: purchase.status,
        subscriptionDurationDays: purchase.subscriptionDurationDays,
        codesGenerated: purchase.codesGenerated,
        paidAt: purchase.paidAt,
        createdAt: purchase.createdAt,
        codeStats: {
          total: stats.total,
          available: stats.available,
          redeemed: stats.redeemed,
          revoked: stats.revoked,
          expired: stats.expired,
        },
      };
    });

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      "Bulk purchases retrieved successfully",
      {
        purchases: purchasesWithDetails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    );
  } catch (err) {
    console.error("Error getting bulk purchases:", err);
    next(err);
  }
};

/**
 * Get codes for a specific bulk purchase
 */
const getBulkPurchaseCodes = async (req, res, next) => {
  try {
    const admin = req.user;
    const { purchaseId } = req.params;
    const { page = 1, limit = 20, status } = req.query;

    // Verify the purchase belongs to this admin
    const purchase = await Model.bulkSubscriptionPurchase.findOne({
      _id: purchaseId,
      adminId: admin._id,
    });

    if (!purchase) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.NOT_FOUND,
        "Bulk purchase not found",
      );
    }

    const query = { purchaseId: purchaseId };
    if (status && status !== "all") {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [codes, total] = await Promise.all([
      Model.bulkSubscriptionCode
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("redeemedBy", "name email")
        .lean(),
      Model.bulkSubscriptionCode.countDocuments(query),
    ]);

    const codesWithDetails = codes.map((c) => ({
      id: c._id,
      code: c.code,
      status: c.status,
      subscriptionDurationDays: c.subscriptionDurationDays,
      expiresAt: c.expiresAt,
      redeemedBy: c.redeemedBy
        ? {
            id: c.redeemedBy._id,
            name: c.redeemedBy.name,
            email: c.redeemedBy.email,
          }
        : null,
      redeemedAt: c.redeemedAt,
      revokedAt: c.revokedAt,
      revokedReason: c.revokedReason,
      createdAt: c.createdAt,
    }));

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      "Codes retrieved successfully",
      {
        codes: codesWithDetails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    );
  } catch (err) {
    console.error("Error getting bulk purchase codes:", err);
    next(err);
  }
};

/**
 * Revoke a subscription code
 */
const revokeCode = async (req, res, next) => {
  try {
    const admin = req.user;
    const { codeId } = req.params;
    const { reason } = req.body;

    // Find the code and verify ownership
    const subscriptionCode = await Model.bulkSubscriptionCode.findOne({
      _id: codeId,
      adminId: admin._id,
    });

    if (!subscriptionCode) {
      return universalFunction.errorFunction(req, res, code.statusCodes.STATUS_CODE.NOT_FOUND, "Code not found");
    }

    if (subscriptionCode.status !== "available") {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        `Cannot revoke a code that is ${subscriptionCode.status}`,
      );
    }

    subscriptionCode.status = "revoked";
    subscriptionCode.revokedAt = new Date();
    subscriptionCode.revokedReason = reason || "Revoked by admin";
    await subscriptionCode.save();

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      "Code revoked successfully",
      {
        id: subscriptionCode._id,
        code: subscriptionCode.code,
        status: subscriptionCode.status,
      },
    );
  } catch (err) {
    console.error("Error revoking code:", err);
    next(err);
  }
};

/**
 * Get bulk subscription statistics for the admin
 */
const getBulkStats = async (req, res, next) => {
  try {
    const admin = req.user;

    const [purchaseStats, codeStats] = await Promise.all([
      Model.bulkSubscriptionPurchase.aggregate([
        { $match: { adminId: admin._id } },
        {
          $group: {
            _id: null,
            totalPurchases: { $sum: 1 },
            completedPurchases: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            totalSpent: {
              $sum: {
                $cond: [{ $eq: ["$status", "completed"] }, "$totalAmount", 0],
              },
            },
            totalCodesPurchased: {
              $sum: {
                $cond: [{ $eq: ["$status", "completed"] }, "$quantity", 0],
              },
            },
          },
        },
      ]),
      Model.bulkSubscriptionCode.aggregate([
        { $match: { adminId: admin._id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            available: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
            redeemed: { $sum: { $cond: [{ $eq: ["$status", "redeemed"] }, 1, 0] } },
            revoked: { $sum: { $cond: [{ $eq: ["$status", "revoked"] }, 1, 0] } },
            expired: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const purchases = purchaseStats[0] || {
      totalPurchases: 0,
      completedPurchases: 0,
      totalSpent: 0,
      totalCodesPurchased: 0,
    };

    const codes = codeStats[0] || {
      total: 0,
      available: 0,
      redeemed: 0,
      revoked: 0,
      expired: 0,
    };

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      "Bulk subscription stats retrieved successfully",
      {
        purchases: {
          total: purchases.totalPurchases,
          completed: purchases.completedPurchases,
          totalSpent: purchases.totalSpent / 100, // Convert from cents
          totalCodesPurchased: purchases.totalCodesPurchased,
        },
        codes: {
          total: codes.total,
          available: codes.available,
          redeemed: codes.redeemed,
          revoked: codes.revoked,
          expired: codes.expired,
        },
      },
    );
  } catch (err) {
    console.error("Error getting bulk stats:", err);
    next(err);
  }
};

/**
 * Create Stripe customer portal session for admin to manage payments
 */
const createAdminPortalSession = async (req, res, next) => {
  try {
    const admin = req.user;
    const stripeCustomerId = admin.stripeCustomerId;

    if (!stripeCustomerId) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        "No payment history found",
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.ADMIN_URL || process.env.FRONTEND_URL}/bulk-subscriptions`,
    });

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      "Portal session created successfully",
      { url: session.url },
    );
  } catch (err) {
    console.error("Error creating admin portal session:", err);
    next(err);
  }
};

module.exports = {
  createBulkCheckoutSession,
  getBulkPurchases,
  getBulkPurchaseCodes,
  revokeCode,
  getBulkStats,
  createAdminPortalSession,
  createAdminSubscription,
};
