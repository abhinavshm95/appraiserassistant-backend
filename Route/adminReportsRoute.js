const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getActiveSubscriptions,
  getKeyGenerationHistory,
  getPaymentHistory,
  getAdminLogs,
  getFrequentQueries,
} = require("../Controller/adminReportsController");

// All routes require authentication and admin role
router.get("/active-subscriptions", auth.authenticate, auth.isAdmin, getActiveSubscriptions);
router.get("/key-history", auth.authenticate, auth.isAdmin, getKeyGenerationHistory);
router.get("/payment-history", auth.authenticate, auth.isAdmin, getPaymentHistory);
router.get("/logs", auth.authenticate, auth.isAdmin, getAdminLogs);
router.get("/frequent-queries", auth.authenticate, auth.isAdmin, getFrequentQueries);

module.exports = router;
