const express = require("express");
const router = express.Router();
const { stripeController } = require("../Controller/index");
const { auth } = require("../middleware/index");

// Get available products and prices (public)
router.get("/products", stripeController.getProducts);

// Create checkout session (authenticated)
router.post("/create-checkout-session", auth.authenticate, stripeController.createCheckoutSession);

// Get subscription status (authenticated)
router.get("/subscription-status", auth.authenticate, stripeController.getSubscriptionStatus);

// Create customer portal session (authenticated)
router.post("/create-portal-session", auth.authenticate, stripeController.createPortalSession);

// Redeem subscription code (authenticated)
router.post("/redeem-code", auth.authenticate, stripeController.redeemSubscriptionCode);

// Validate subscription code (public - for preview before signup)
router.post("/validate-code", stripeController.validateSubscriptionCode);

// Sync products from Stripe (admin only)
router.post("/sync", auth.authenticate, auth.isAdmin, stripeController.syncStripeData);

module.exports = router;
