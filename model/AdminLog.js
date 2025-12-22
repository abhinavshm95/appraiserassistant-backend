const Mongoose = require("mongoose");

const adminLogSchema = new Mongoose.Schema(
  {
    adminId: {
      type: Mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String, // e.g., "Created Key", "Revoked Key", "Deactivated User"
      required: true,
    },
    details: {
      type: Mongoose.Schema.Types.Mixed, // Flexible field for extra data
      default: {},
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for common queries
adminLogSchema.index({ adminId: 1, createdAt: -1 });
adminLogSchema.index({ action: 1 });
adminLogSchema.index({ createdAt: -1 });

const AdminLog = Mongoose.model("AdminLog", adminLogSchema);

module.exports = AdminLog;
