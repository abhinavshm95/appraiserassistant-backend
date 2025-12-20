const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  createBulkCheckoutSession,
  getBulkPurchases,
  getBulkPurchaseCodes,
  revokeCode,
  getBulkStats,
  createAdminPortalSession,
} = require("../Controller/adminBulkSubscriptionController");

// All routes require authentication and admin/manager role
router.post("/create-checkout-session", auth.authenticate, auth.isManagerOrAdmin, createBulkCheckoutSession);
router.get("/purchases", auth.authenticate, auth.isManagerOrAdmin, getBulkPurchases);
router.get("/purchases/:purchaseId/codes", auth.authenticate, auth.isManagerOrAdmin, getBulkPurchaseCodes);
router.post("/codes/:codeId/revoke", auth.authenticate, auth.isManagerOrAdmin, revokeCode);
router.get("/stats", auth.authenticate, auth.isManagerOrAdmin, getBulkStats);
router.post("/portal-session", auth.authenticate, auth.isManagerOrAdmin, createAdminPortalSession);

module.exports = router;
