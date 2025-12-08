const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
    createBulkCheckoutSession,
    getBulkPurchases,
    getBulkPurchaseCodes,
    revokeCode,
    getBulkStats,
    createAdminPortalSession
} = require("../Controller/adminBulkSubscriptionController");

// All routes require authentication and admin role
router.post("/create-checkout-session", auth.authenticate, auth.isAdmin, createBulkCheckoutSession);
router.get("/purchases", auth.authenticate, auth.isAdmin, getBulkPurchases);
router.get("/purchases/:purchaseId/codes", auth.authenticate, auth.isAdmin, getBulkPurchaseCodes);
router.post("/codes/:codeId/revoke", auth.authenticate, auth.isAdmin, revokeCode);
router.get("/stats", auth.authenticate, auth.isAdmin, getBulkStats);
router.post("/portal-session", auth.authenticate, auth.isAdmin, createAdminPortalSession);

module.exports = router;
