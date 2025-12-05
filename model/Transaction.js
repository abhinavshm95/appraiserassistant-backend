const Mongoose = require("mongoose");

const transactionSchema = new Mongoose.Schema({
    // User reference
    userId: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    // Stripe identifiers
    stripeCustomerId: {
        type: String,
        required: true,
        index: true
    },
    stripeSubscriptionId: {
        type: String,
        default: null,
        index: true
    },
    stripeInvoiceId: {
        type: String,
        unique: true,
        sparse: true // Allows multiple null values
    },
    stripePaymentIntentId: {
        type: String,
        unique: true,
        sparse: true
    },
    stripeChargeId: {
        type: String,
        default: null
    },

    // Transaction details
    type: {
        type: String,
        enum: [
            "subscription_created",
            "subscription_renewed",
            "subscription_updated",
            "subscription_canceled",
            "payment_succeeded",
            "payment_failed",
            "refund",
            "credit_note"
        ],
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "succeeded", "failed", "refunded", "canceled"],
        default: "pending"
    },

    // Amount information
    amount: {
        type: Number, // Amount in cents
        required: true
    },
    currency: {
        type: String,
        default: "usd",
        lowercase: true
    },
    amountRefunded: {
        type: Number,
        default: 0
    },

    // Product/Price information
    stripePriceId: {
        type: String,
        default: null
    },
    stripeProductId: {
        type: String,
        default: null
    },
    productName: {
        type: String,
        default: null
    },

    // Billing period
    periodStart: {
        type: Date,
        default: null
    },
    periodEnd: {
        type: Date,
        default: null
    },

    // Payment method details (stored for reference)
    paymentMethod: {
        type: {
            type: String, // "card", "bank_transfer", etc.
            default: null
        },
        brand: {
            type: String, // "visa", "mastercard", etc.
            default: null
        },
        last4: {
            type: String,
            default: null
        },
        expiryMonth: {
            type: Number,
            default: null
        },
        expiryYear: {
            type: Number,
            default: null
        }
    },

    // Failure information
    failureCode: {
        type: String,
        default: null
    },
    failureMessage: {
        type: String,
        default: null
    },

    // Invoice details
    invoiceUrl: {
        type: String,
        default: null
    },
    invoicePdf: {
        type: String,
        default: null
    },
    receiptUrl: {
        type: String,
        default: null
    },

    // Raw event data for debugging/auditing
    stripeEventId: {
        type: String,
        unique: true,
        sparse: true
    },
    rawEventType: {
        type: String,
        default: null
    },

    // Additional metadata
    metadata: {
        type: Map,
        of: String,
        default: {}
    },

    // Description
    description: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Compound indexes for common queries
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ stripeCustomerId: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ createdAt: -1 });

// Virtual for formatted amount
transactionSchema.virtual("formattedAmount").get(function() {
    return (this.amount / 100).toFixed(2);
});

// Ensure virtuals are included in JSON
transactionSchema.set("toJSON", { virtuals: true });
transactionSchema.set("toObject", { virtuals: true });

const Transaction = Mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
