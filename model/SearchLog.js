const Mongoose = require("mongoose");

const searchLogSchema = new Mongoose.Schema(
  {
    userId: {
      type: Mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // Can be null for unauthenticated searches if we decide to track them
      index: true,
    },
    query: {
      type: Map,
      of: String, // Stores query parameters like { make: "Toyota", model: "Camry" }
      default: {},
    },
    endpoint: {
      type: String, // e.g., "/car-listing", "/salvage-listing"
      required: true,
    },
    ip: {
      type: String,
      default: null,
    },
    count: {
      type: Number,
      default: 1, // For aggregation if we decide to pre-aggregate, but raw logs usually created individually
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
searchLogSchema.index({ userId: 1, createdAt: -1 });
searchLogSchema.index({ endpoint: 1 });
searchLogSchema.index({ createdAt: -1 });

const SearchLog = Mongoose.model("SearchLog", searchLogSchema);

module.exports = SearchLog;
