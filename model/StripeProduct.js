const Mongoose = require("mongoose");

const stripeProductSchema = new Mongoose.Schema({
    stripeProductId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ""
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

const StripeProduct = Mongoose.model("StripeProduct", stripeProductSchema);

module.exports = StripeProduct;
