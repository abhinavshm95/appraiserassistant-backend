const Mongoose = require("mongoose");

const userSubscriptionSchema = new Mongoose.Schema({
    userId: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    stripeCustomerId: {
        type: String,
        required: true
    },
    stripeSubscriptionId: {
        type: String,
        default: null
    },
    stripePriceId: {
        type: String,
        default: null
    },
    stripeProductId: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: [
            "incomplete",
            "incomplete_expired",
            "trialing",
            "active",
            "past_due",
            "canceled",
            "unpaid",
            "paused"
        ],
        default: "incomplete"
    },
    currentPeriodStart: {
        type: Date,
        default: null
    },
    currentPeriodEnd: {
        type: Date,
        default: null
    },
    cancelAtPeriodEnd: {
        type: Boolean,
        default: false
    },
    canceledAt: {
        type: Date,
        default: null
    },
    endedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index for quick lookup by userId
userSubscriptionSchema.index({ userId: 1 });
// Index for quick lookup by stripeCustomerId
userSubscriptionSchema.index({ stripeCustomerId: 1 });
// Index for quick lookup by stripeSubscriptionId
userSubscriptionSchema.index({ stripeSubscriptionId: 1 });

const UserSubscription = Mongoose.model("UserSubscription", userSubscriptionSchema);

module.exports = UserSubscription;
