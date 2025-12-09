const Mongoose = require("mongoose");
const crypto = require("crypto");

const subscriptionKeySchema = new Mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    duration: {
        type: String,
        enum: ['monthly', '1_year', '2_years'],
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'used', 'revoked', 'expired'],
        default: 'active',
        index: true
    },
    createdBy: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    usedBy: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    usedAt: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },
    revokedAt: {
        type: Date,
        default: null
    },
    revokedReason: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Generate a unique subscription key
subscriptionKeySchema.statics.generateKey = function() {
    const year = new Date().getFullYear();
    const randomPart1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const randomPart2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const randomPart3 = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `KEY-${year}-${randomPart1}-${randomPart2}-${randomPart3}`;
};

// Calculate expiration date based on duration
subscriptionKeySchema.statics.getExpirationDate = function(duration) {
    const date = new Date();
    switch (duration) {
        case 'monthly':
            date.setMonth(date.getMonth() + 1);
            break;
        case '1_year':
            date.setFullYear(date.getFullYear() + 1);
            break;
        case '2_years':
            date.setFullYear(date.getFullYear() + 2);
            break;
        default:
            date.setMonth(date.getMonth() + 1);
    }
    return date;
};

// Check if key is expired
subscriptionKeySchema.methods.isExpired = function() {
    return new Date() > this.expiresAt;
};

// Mark key as used
subscriptionKeySchema.methods.markAsUsed = async function(userId) {
    this.status = 'used';
    this.usedBy = userId;
    this.usedAt = new Date();
    return this.save();
};

// Revoke key
subscriptionKeySchema.methods.revoke = async function(reason) {
    this.status = 'revoked';
    this.revokedAt = new Date();
    this.revokedReason = reason || 'Revoked by admin';
    return this.save();
};

const SubscriptionKey = Mongoose.model("SubscriptionKey", subscriptionKeySchema);

module.exports = SubscriptionKey;
