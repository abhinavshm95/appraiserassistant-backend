const express = require("express");
const router = express.Router();
const { stripeWebhookController } = require("../Controller/index");

/**
 * Stripe Webhook Route
 *
 * IMPORTANT: This route must use raw body parsing for signature verification.
 * The raw body parser is configured in index.js specifically for this route.
 *
 * Security measures:
 * 1. Uses raw body (not JSON parsed) for signature verification
 * 2. Webhook signature is verified in the controller
 * 3. No authentication middleware - Stripe authenticates via signature
 */
router.post(
    "/",
    // Note: express.raw() middleware is applied at the app level for this route
    stripeWebhookController.handleWebhook
);

module.exports = router;
