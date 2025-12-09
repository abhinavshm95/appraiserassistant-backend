const Mongoose = require("mongoose");
const crypto = require("crypto");

const bulkSubscriptionCodeSchema = new Mongoose.Schema({
    purchaseId: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: "BulkSubscriptionPurchase",
        required: true
    },
    adminId: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    code: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ["available", "redeemed", "revoked", "expired"],
        default: "available"
    },
    redeemedBy: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    redeemedAt: {
        type: Date,
        default: null
    },
    stripePriceId: {
        type: String,
        required: true
    },
    stripeProductId: {
        type: String,
        required: true
    },
    subscriptionDurationDays: {
        type: Number,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    revokedAt: {
        type: Date,
        default: null
    },
    revokedReason: {
        type: String,
        default: null
    },
    // Store previous user when code is revoked from a redeemed state
    // This allows reactivation for the same user
    previouslyRedeemedBy: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    }
}, {
    timestamps: true
});

// Index for quick lookup by code (used for redemption)
bulkSubscriptionCodeSchema.index({ code: 1 });
// Index for quick lookup by purchaseId
bulkSubscriptionCodeSchema.index({ purchaseId: 1 });
// Index for quick lookup by adminId
bulkSubscriptionCodeSchema.index({ adminId: 1 });
// Index for status queries
bulkSubscriptionCodeSchema.index({ status: 1 });
// Index for redeemedBy to check if user already has a code
bulkSubscriptionCodeSchema.index({ redeemedBy: 1 });
// Compound index for admin viewing their codes by status
bulkSubscriptionCodeSchema.index({ adminId: 1, status: 1 });
// Index for expiration checks
bulkSubscriptionCodeSchema.index({ expiresAt: 1, status: 1 });

/**
 * Generate a unique, secure subscription code
 * Format: XXXX-XXXX-XXXX-XXXX (16 chars, alphanumeric, uppercase)
 */
bulkSubscriptionCodeSchema.statics.generateCode = function() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars: I, O, 0, 1
    let code = "";
    const bytes = crypto.randomBytes(16);

    for (let i = 0; i < 16; i++) {
        code += chars[bytes[i] % chars.length];
        if (i === 3 || i === 7 || i === 11) {
            code += "-";
        }
    }

    return code;
};

/**
 * Generate multiple unique codes
 */
bulkSubscriptionCodeSchema.statics.generateUniqueCodes = async function(count) {
    const codes = [];
    const existingCodes = new Set();

    // Get all existing codes to avoid collisions
    const existing = await this.find({}, { code: 1 }).lean();
    existing.forEach(doc => existingCodes.add(doc.code));

    while (codes.length < count) {
        const code = this.generateCode();
        if (!existingCodes.has(code) && !codes.includes(code)) {
            codes.push(code);
            existingCodes.add(code);
        }
    }

    return codes;
};

const BulkSubscriptionCode = Mongoose.model("BulkSubscriptionCode", bulkSubscriptionCodeSchema);

module.exports = BulkSubscriptionCode;
