const Model = require("../model/index");
const universalFunction = require("../universalFunction/universalFunction");
const code = require("../statusCode/index");

/**
 * Generate subscription keys
 * Admin only - creates new subscription keys for distribution
 */
const generateKeys = async (req, res, next) => {
    try {
        const admin = req.user;
        const { duration, count = 1 } = req.body;

        if (!duration || !['monthly', '1_year', '2_years'].includes(duration)) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Valid duration is required (monthly, 1_year, or 2_years)"
            );
        }

        const keyCount = Math.min(Math.max(parseInt(count) || 1, 1), 100);
        const expiresAt = Model.subscriptionKey.getExpirationDate(duration);

        const keysToCreate = [];
        const generatedKeys = new Set();

        // Generate unique keys
        for (let i = 0; i < keyCount; i++) {
            let key;
            do {
                key = Model.subscriptionKey.generateKey();
            } while (generatedKeys.has(key));
            generatedKeys.add(key);

            keysToCreate.push({
                key,
                duration,
                status: 'active',
                createdBy: admin._id,
                expiresAt
            });
        }

        const createdKeys = await Model.subscriptionKey.insertMany(keysToCreate);

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.CREATED,
            `${keyCount} subscription key(s) generated successfully`,
            {
                keys: createdKeys.map(k => ({
                    id: k._id,
                    key: k.key,
                    duration: k.duration,
                    status: k.status,
                    createdAt: k.createdAt,
                    expiresAt: k.expiresAt
                }))
            }
        );
    } catch (err) {
        console.error("Error generating subscription keys:", err);
        next(err);
    }
};

/**
 * Get all subscription keys with pagination and filters
 */
const getKeys = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, status, duration, search } = req.query;

        const query = {};

        if (status && status !== 'all') {
            query.status = status;
        }

        if (duration && duration !== 'all') {
            query.duration = duration;
        }

        if (search) {
            query.key = { $regex: search, $options: 'i' };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [keys, total] = await Promise.all([
            Model.subscriptionKey.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate("usedBy", "name email")
                .populate("createdBy", "name email")
                .lean(),
            Model.subscriptionKey.countDocuments(query)
        ]);

        const keysWithDetails = keys.map(k => ({
            id: k._id,
            key: k.key,
            duration: k.duration,
            status: k.status,
            createdAt: k.createdAt,
            expiresAt: k.expiresAt,
            usedBy: k.usedBy ? {
                id: k.usedBy._id,
                name: k.usedBy.name,
                email: k.usedBy.email
            } : null,
            usedAt: k.usedAt,
            createdBy: k.createdBy ? {
                id: k.createdBy._id,
                name: k.createdBy.name,
                email: k.createdBy.email
            } : null,
            revokedAt: k.revokedAt,
            revokedReason: k.revokedReason
        }));

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Subscription keys retrieved successfully",
            {
                keys: keysWithDetails,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        );
    } catch (err) {
        console.error("Error getting subscription keys:", err);
        next(err);
    }
};

/**
 * Get subscription key statistics
 */
const getKeyStats = async (req, res, next) => {
    try {
        const stats = await Model.subscriptionKey.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                    used: { $sum: { $cond: [{ $eq: ["$status", "used"] }, 1, 0] } },
                    revoked: { $sum: { $cond: [{ $eq: ["$status", "revoked"] }, 1, 0] } },
                    expired: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } }
                }
            }
        ]);

        const keyStats = stats[0] || {
            total: 0,
            active: 0,
            used: 0,
            revoked: 0,
            expired: 0
        };

        // Get stats by duration
        const durationStats = await Model.subscriptionKey.aggregate([
            {
                $group: {
                    _id: "$duration",
                    count: { $sum: 1 },
                    active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } }
                }
            }
        ]);

        const byDuration = {
            monthly: { total: 0, active: 0 },
            '1_year': { total: 0, active: 0 },
            '2_years': { total: 0, active: 0 }
        };

        durationStats.forEach(d => {
            if (byDuration[d._id]) {
                byDuration[d._id] = { total: d.count, active: d.active };
            }
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Key statistics retrieved successfully",
            {
                total: keyStats.total,
                active: keyStats.active,
                used: keyStats.used,
                revoked: keyStats.revoked,
                expired: keyStats.expired,
                byDuration
            }
        );
    } catch (err) {
        console.error("Error getting key stats:", err);
        next(err);
    }
};

/**
 * Revoke a subscription key
 */
const revokeKey = async (req, res, next) => {
    try {
        const { keyId } = req.params;
        const { reason } = req.body;

        const subscriptionKey = await Model.subscriptionKey.findById(keyId);

        if (!subscriptionKey) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.NOT_FOUND,
                "Subscription key not found"
            );
        }

        if (subscriptionKey.status !== 'active') {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                `Cannot revoke a key that is ${subscriptionKey.status}`
            );
        }

        await subscriptionKey.revoke(reason);

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Subscription key revoked successfully",
            {
                id: subscriptionKey._id,
                key: subscriptionKey.key,
                status: subscriptionKey.status
            }
        );
    } catch (err) {
        console.error("Error revoking subscription key:", err);
        next(err);
    }
};

/**
 * Validate and redeem a subscription key (for users)
 */
const redeemKey = async (req, res, next) => {
    try {
        const user = req.user;
        const { key } = req.body;

        if (!key) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Subscription key is required"
            );
        }

        const subscriptionKey = await Model.subscriptionKey.findOne({ key: key.trim().toUpperCase() });

        if (!subscriptionKey) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.NOT_FOUND,
                "Invalid subscription key"
            );
        }

        if (subscriptionKey.status !== 'active') {
            let message = "This key has already been used";
            if (subscriptionKey.status === 'revoked') {
                message = "This key has been revoked";
            } else if (subscriptionKey.status === 'expired') {
                message = "This key has expired";
            }
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                message
            );
        }

        // Check if key is expired
        if (subscriptionKey.isExpired()) {
            subscriptionKey.status = 'expired';
            await subscriptionKey.save();
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "This key has expired"
            );
        }

        // Mark key as used
        await subscriptionKey.markAsUsed(user._id);

        // Calculate subscription end date based on key duration
        const subscriptionEndDate = Model.subscriptionKey.getExpirationDate(subscriptionKey.duration);

        // Update or create user subscription
        let userSubscription = await Model.userSubscription.findOne({ userId: user._id });

        if (userSubscription) {
            userSubscription.status = 'active';
            userSubscription.currentPeriodEnd = subscriptionEndDate;
            userSubscription.subscriptionKeyId = subscriptionKey._id;
            await userSubscription.save();
        } else {
            userSubscription = await Model.userSubscription.create({
                userId: user._id,
                status: 'active',
                currentPeriodEnd: subscriptionEndDate,
                subscriptionKeyId: subscriptionKey._id
            });
        }

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Subscription key redeemed successfully",
            {
                duration: subscriptionKey.duration,
                subscriptionEndsAt: subscriptionEndDate
            }
        );
    } catch (err) {
        console.error("Error redeeming subscription key:", err);
        next(err);
    }
};

/**
 * Export keys to CSV (returns data for client-side CSV generation)
 */
const exportKeys = async (req, res, next) => {
    try {
        const { status, duration } = req.query;

        const query = {};
        if (status && status !== 'all') {
            query.status = status;
        }
        if (duration && duration !== 'all') {
            query.duration = duration;
        }

        const keys = await Model.subscriptionKey.find(query)
            .sort({ createdAt: -1 })
            .populate("usedBy", "name email")
            .lean();

        const exportData = keys.map(k => ({
            key: k.key,
            duration: k.duration,
            status: k.status,
            createdAt: k.createdAt,
            expiresAt: k.expiresAt,
            usedByEmail: k.usedBy?.email || '',
            usedAt: k.usedAt || ''
        }));

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Keys exported successfully",
            {
                keys: exportData,
                total: exportData.length
            }
        );
    } catch (err) {
        console.error("Error exporting keys:", err);
        next(err);
    }
};

module.exports = {
    generateKeys,
    getKeys,
    getKeyStats,
    revokeKey,
    redeemKey,
    exportKeys
};
