const jwt = require("jsonwebtoken");
const Model = require("../model/index");
const code = require("../statusCode/index");

const JWT_SECRET = process.env.JWT_SECRET || "CARvadvdsvfdsv";

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
        statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
        message: "Access token is required",
      });
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await Model.user.findOne({ email: decoded.email });

      if (!user) {
        return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
          statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
          message: "User not found",
        });
      }

      // Single-device login: Check if sessionVersion matches
      if (decoded.sessionVersion !== undefined && decoded.sessionVersion !== user.sessionVersion) {
        return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
          statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
          message: "Session expired. You have been logged in on another device.",
          code: "SESSION_INVALIDATED",
        });
      }

      req.user = user;
      next();
    } catch (jwtError) {
      return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
        statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
        message: "Invalid or expired token",
      });
    }
  } catch (err) {
    next(err);
  }
};

const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
        statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
        message: "Authentication required",
      });
    }

    if (req.user.role !== "admin") {
      return res.status(code.statusCodes.STATUS_CODE.ACCESS_NOT_ALLOWED).json({
        statusCode: code.statusCodes.STATUS_CODE.ACCESS_NOT_ALLOWED,
        message: "Admin access required",
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  authenticate,
  isAdmin,
};
