const AdminLog = require("../model/AdminLog");

const logAdminAction = async (adminId, action, details, req) => {
  try {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await AdminLog.create({
      adminId,
      action,
      details,
      ip,
      userAgent,
    });
  } catch (error) {
    console.error("Failed to log admin action:", error);
    // Suppress error to avoid failing the main request
  }
};

module.exports = { logAdminAction };
