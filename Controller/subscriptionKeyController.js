const Model = require("../model/index");
const universalFunction = require("../universalFunction/universalFunction");
const code = require("../statusCode/index");

/**
 * Get all subscription codes across all bulk purchases with pagination and filters
 * Admin only - provides a unified view of all purchased codes
 */
const getAllCodes = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, status, search } = req.query;

        const query = {};

        if (status && status !== 'all') {
            query.status = status;
        }

        if (search) {
            query.code = { $regex: search, $options: 'i' };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [codes, total] = await Promise.all([
            Model.bulkSubscriptionCode.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate("redeemedBy", "name email")
                .populate("previouslyRedeemedBy", "name email")
                .populate("purchaseId", "quantity totalAmount paidAt")
                .lean(),
            Model.bulkSubscriptionCode.countDocuments(query)
        ]);

        // Get product details for each code
        const productIds = [...new Set(codes.map(c => c.stripeProductId))];
        const products = await Model.stripeProduct.find({
            stripeProductId: { $in: productIds }
        }).lean();
        const productMap = new Map(products.map(p => [p.stripeProductId, p]));

        const codesWithDetails = codes.map(c => {
            const product = productMap.get(c.stripeProductId);
            return {
                id: c._id,
                code: c.code,
                status: c.status,
                productName: product?.name || "Unknown Product",
                subscriptionDurationDays: c.subscriptionDurationDays,
                expiresAt: c.expiresAt,
                createdAt: c.createdAt,
                redeemedBy: c.redeemedBy ? {
                    id: c.redeemedBy._id,
                    name: c.redeemedBy.name,
                    email: c.redeemedBy.email
                } : null,
                redeemedAt: c.redeemedAt,
                revokedAt: c.revokedAt,
                revokedReason: c.revokedReason,
                previouslyRedeemedBy: c.previouslyRedeemedBy ? {
                    id: c.previouslyRedeemedBy._id,
                    name: c.previouslyRedeemedBy.name,
                    email: c.previouslyRedeemedBy.email
                } : null,
                purchase: c.purchaseId ? {
                    id: c.purchaseId._id,
                    paidAt: c.purchaseId.paidAt
                } : null
            };
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Subscription codes retrieved successfully",
            {
                codes: codesWithDetails,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        );
    } catch (err) {
        console.error("Error getting subscription codes:", err);
        next(err);
    }
};

/**
 * Get subscription code statistics across all bulk purchases
 */
const getCodeStats = async (req, res, next) => {
    try {
        const stats = await Model.bulkSubscriptionCode.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    available: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
                    redeemed: { $sum: { $cond: [{ $eq: ["$status", "redeemed"] }, 1, 0] } },
                    revoked: { $sum: { $cond: [{ $eq: ["$status", "revoked"] }, 1, 0] } },
                    expired: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } }
                }
            }
        ]);

        const codeStats = stats[0] || {
            total: 0,
            available: 0,
            redeemed: 0,
            revoked: 0,
            expired: 0
        };

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Code statistics retrieved successfully",
            {
                total: codeStats.total,
                available: codeStats.available,
                redeemed: codeStats.redeemed,
                revoked: codeStats.revoked,
                expired: codeStats.expired
            }
        );
    } catch (err) {
        console.error("Error getting code stats:", err);
        next(err);
    }
};

/**
 * Revoke a subscription code
 * - If code is 'available', it becomes 'revoked'
 * - If code is 'redeemed', it becomes 'available' again (freed up for reassignment)
 *   and stores the previous user for potential reactivation
 */
const revokeCode = async (req, res, next) => {
    try {
        const { codeId } = req.params;
        const { reason } = req.body;

        const subscriptionCode = await Model.bulkSubscriptionCode.findById(codeId)
            .populate("redeemedBy", "name email");

        if (!subscriptionCode) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.NOT_FOUND,
                "Subscription code not found"
            );
        }

        if (subscriptionCode.status === 'revoked') {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "This code has already been revoked"
            );
        }

        if (subscriptionCode.status === 'expired') {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Cannot revoke an expired code"
            );
        }

        const wasRedeemed = subscriptionCode.status === 'redeemed';
        const previousUser = subscriptionCode.redeemedBy;

        if (wasRedeemed) {
            // Code was redeemed - make it available again and store previous user
            subscriptionCode.previouslyRedeemedBy = subscriptionCode.redeemedBy;
            subscriptionCode.status = 'available';
            subscriptionCode.redeemedBy = null;
            subscriptionCode.redeemedAt = null;
            subscriptionCode.revokedAt = new Date();
            subscriptionCode.revokedReason = reason || 'Revoked by admin';

            // Also update user's subscription status
            if (previousUser) {
                await Model.userSubscription.findOneAndUpdate(
                    { userId: previousUser._id },
                    { status: 'canceled' }
                );
            }
        } else {
            // Code was available - just mark as revoked
            subscriptionCode.status = 'revoked';
            subscriptionCode.revokedAt = new Date();
            subscriptionCode.revokedReason = reason || 'Revoked by admin';
        }

        await subscriptionCode.save();

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            wasRedeemed
                ? "Code revoked from user and is now available for reassignment"
                : "Subscription code revoked successfully",
            {
                id: subscriptionCode._id,
                code: subscriptionCode.code,
                status: subscriptionCode.status,
                previouslyRedeemedBy: previousUser ? {
                    id: previousUser._id,
                    name: previousUser.name,
                    email: previousUser.email
                } : null
            }
        );
    } catch (err) {
        console.error("Error revoking subscription code:", err);
        next(err);
    }
};

/**
 * Reactivate a subscription code for its previous user
 * Only works for codes that were previously redeemed and then revoked
 */
const reactivateCode = async (req, res, next) => {
    try {
        const { codeId } = req.params;

        const subscriptionCode = await Model.bulkSubscriptionCode.findById(codeId)
            .populate("previouslyRedeemedBy", "name email");

        if (!subscriptionCode) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.NOT_FOUND,
                "Subscription code not found"
            );
        }

        if (subscriptionCode.status !== 'available') {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                `Cannot reactivate a code that is ${subscriptionCode.status}`
            );
        }

        if (!subscriptionCode.previouslyRedeemedBy) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "This code has no previous user to reactivate for"
            );
        }

        const previousUser = subscriptionCode.previouslyRedeemedBy;

        // Check if user already has an active subscription code
        const existingActiveCode = await Model.bulkSubscriptionCode.findOne({
            redeemedBy: previousUser._id,
            status: 'redeemed'
        });

        if (existingActiveCode) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "User already has an active subscription code"
            );
        }

        // Reactivate the code for the previous user
        subscriptionCode.status = 'redeemed';
        subscriptionCode.redeemedBy = previousUser._id;
        subscriptionCode.redeemedAt = new Date();
        subscriptionCode.revokedAt = null;
        subscriptionCode.revokedReason = null;
        subscriptionCode.previouslyRedeemedBy = null;

        await subscriptionCode.save();

        // Calculate subscription end date
        const subscriptionEndDate = new Date();
        subscriptionEndDate.setDate(subscriptionEndDate.getDate() + subscriptionCode.subscriptionDurationDays);

        // Update user's subscription
        await Model.userSubscription.findOneAndUpdate(
            { userId: previousUser._id },
            {
                status: 'active',
                currentPeriodEnd: subscriptionEndDate
            },
            { upsert: true }
        );

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Code reactivated successfully for previous user",
            {
                id: subscriptionCode._id,
                code: subscriptionCode.code,
                status: subscriptionCode.status,
                redeemedBy: {
                    id: previousUser._id,
                    name: previousUser.name,
                    email: previousUser.email
                }
            }
        );
    } catch (err) {
        console.error("Error reactivating subscription code:", err);
        next(err);
    }
};

/**
 * Make a revoked code available again (without assigning to previous user)
 */
const makeCodeAvailable = async (req, res, next) => {
    try {
        const { codeId } = req.params;

        const subscriptionCode = await Model.bulkSubscriptionCode.findById(codeId);

        if (!subscriptionCode) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.NOT_FOUND,
                "Subscription code not found"
            );
        }

        if (subscriptionCode.status !== 'revoked') {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Only revoked codes can be made available"
            );
        }

        subscriptionCode.status = 'available';
        subscriptionCode.revokedAt = null;
        subscriptionCode.revokedReason = null;
        subscriptionCode.previouslyRedeemedBy = null;

        await subscriptionCode.save();

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Code is now available for use",
            {
                id: subscriptionCode._id,
                code: subscriptionCode.code,
                status: subscriptionCode.status
            }
        );
    } catch (err) {
        console.error("Error making code available:", err);
        next(err);
    }
};

/**
 * Export codes to CSV (returns data for client-side CSV generation)
 */
const exportCodes = async (req, res, next) => {
    try {
        const { status } = req.query;

        const query = {};
        if (status && status !== 'all') {
            query.status = status;
        }

        const codes = await Model.bulkSubscriptionCode.find(query)
            .sort({ createdAt: -1 })
            .populate("redeemedBy", "name email")
            .populate("previouslyRedeemedBy", "name email")
            .lean();

        // Get product details
        const productIds = [...new Set(codes.map(c => c.stripeProductId))];
        const products = await Model.stripeProduct.find({
            stripeProductId: { $in: productIds }
        }).lean();
        const productMap = new Map(products.map(p => [p.stripeProductId, p]));

        const exportData = codes.map(c => {
            const product = productMap.get(c.stripeProductId);
            return {
                code: c.code,
                status: c.status,
                productName: product?.name || "Unknown",
                subscriptionDurationDays: c.subscriptionDurationDays,
                createdAt: c.createdAt,
                expiresAt: c.expiresAt,
                redeemedByEmail: c.redeemedBy?.email || '',
                redeemedAt: c.redeemedAt || '',
                previouslyRedeemedByEmail: c.previouslyRedeemedBy?.email || ''
            };
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Codes exported successfully",
            {
                codes: exportData,
                total: exportData.length
            }
        );
    } catch (err) {
        console.error("Error exporting codes:", err);
        next(err);
    }
};

module.exports = {
    getAllCodes,
    getCodeStats,
    revokeCode,
    reactivateCode,
    makeCodeAvailable,
    exportCodes
};
