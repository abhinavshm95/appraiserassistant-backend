const Mongoose = require("mongoose");

const bulkSubscriptionPurchaseSchema = new Mongoose.Schema({
    adminId: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    stripeCustomerId: {
        type: String,
        required: true
    },
    stripeCheckoutSessionId: {
        type: String,
        default: null
    },
    stripePaymentIntentId: {
        type: String,
        default: null
    },
    stripeSubscriptionId: {
        type: String,
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
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    unitAmount: {
        type: Number,
        required: true
    },
    totalAmount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: "usd"
    },
    status: {
        type: String,
        enum: ["pending", "completed", "failed", "refunded"],
        default: "pending"
    },
    subscriptionDurationDays: {
        type: Number,
        required: true
    },
    codesGenerated: {
        type: Boolean,
        default: false
    },
    paidAt: {
        type: Date,
        default: null
    },
    metadata: {
        type: Map,
        of: String,
        default: {}
    }
}, {
    timestamps: true
});

// Index for quick lookup by adminId
bulkSubscriptionPurchaseSchema.index({ adminId: 1 });
// Index for quick lookup by stripeCheckoutSessionId
bulkSubscriptionPurchaseSchema.index({ stripeCheckoutSessionId: 1 });
// Index for quick lookup by stripePaymentIntentId
bulkSubscriptionPurchaseSchema.index({ stripePaymentIntentId: 1 });
// Index for quick lookup by stripeSubscriptionId
bulkSubscriptionPurchaseSchema.index({ stripeSubscriptionId: 1 });
// Index for status queries
bulkSubscriptionPurchaseSchema.index({ status: 1 });

const BulkSubscriptionPurchase = Mongoose.model("BulkSubscriptionPurchase", bulkSubscriptionPurchaseSchema);

module.exports = BulkSubscriptionPurchase;
