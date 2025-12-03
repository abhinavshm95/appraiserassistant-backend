const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getAllSubscriptions,
  getSubscriptionStats,
  getSubscriptionById,
} = require("../Controller/adminSubscriptionController");

// All routes require authentication and admin role
router.get("/list", auth.authenticate, auth.isAdmin, getAllSubscriptions);
router.get("/stats", auth.authenticate, auth.isAdmin, getSubscriptionStats);
router.get("/:id", auth.authenticate, auth.isAdmin, getSubscriptionById);

module.exports = router;
