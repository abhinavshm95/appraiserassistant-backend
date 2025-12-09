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
 */
const revokeCode = async (req, res, next) => {
    try {
        const { codeId } = req.params;
        const { reason } = req.body;

        const subscriptionCode = await Model.bulkSubscriptionCode.findById(codeId);

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
                `Cannot revoke a code that is ${subscriptionCode.status}`
            );
        }

        subscriptionCode.status = 'revoked';
        subscriptionCode.revokedAt = new Date();
        subscriptionCode.revokedReason = reason || 'Revoked by admin';
        await subscriptionCode.save();

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Subscription code revoked successfully",
            {
                id: subscriptionCode._id,
                code: subscriptionCode.code,
                status: subscriptionCode.status
            }
        );
    } catch (err) {
        console.error("Error revoking subscription code:", err);
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
                redeemedAt: c.redeemedAt || ''
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
    exportCodes
};
