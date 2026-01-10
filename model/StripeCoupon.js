const Mongoose = require("mongoose");

const stripeCouponSchema = new Mongoose.Schema({
    stripeCouponId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    percentOff: {
        type: Number
    },
    amountOff: {
        type: Number
    },
    currency: {
        type: String
    },
    duration: {
        type: String,
        enum: ['forever', 'once', 'repeating'],
        required: true
    },
    durationInMonths: {
        type: Number
    },
    appliesToProducts: [{
        type: String,
        ref: 'StripeProduct'
    }],
    appliesToPrices: [{
        type: String,
        ref: 'StripePrice'
    }],
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

module.exports = Mongoose.model("StripeCoupon", stripeCouponSchema);
