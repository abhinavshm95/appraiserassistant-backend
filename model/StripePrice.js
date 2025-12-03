const Mongoose = require("mongoose");

const stripePriceSchema = new Mongoose.Schema({
    stripePriceId: {
        type: String,
        required: true,
        unique: true
    },
    stripeProductId: {
        type: String,
        required: true,
        ref: "StripeProduct"
    },
    unitAmount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: "usd"
    },
    interval: {
        type: String,
        enum: ["day", "week", "month", "year"],
        required: true
    },
    intervalCount: {
        type: Number,
        default: 1
    },
    active: {
        type: Boolean,
        default: true
    },
    metadata: {
        type: Map,
        of: String,
        default: {}
    }
}, {
    timestamps: true
});

const StripePrice = Mongoose.model("StripePrice", stripePriceSchema);

module.exports = StripePrice;
