const Mongoose = require("mongoose");

const tokenSchema = new Mongoose.Schema({
    userId: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    token: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['refresh', 'resetPassword', 'verifyEmail'],
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 7 * 24 * 60 * 60 // Auto-delete after 7 days
    }
});

const Token = Mongoose.model("Token", tokenSchema);

module.exports = Token;
