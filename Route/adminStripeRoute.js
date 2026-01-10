const express = require("express");
const router = express.Router();
const { adminStripeController } = require("../Controller/index");
const { auth } = require("../middleware/index");

// All routes require authentication and admin role (or at least manager if configured, but keeping strict admin for now)
router.use(auth.authenticate, auth.isAdmin);

// Products
router.get("/products", adminStripeController.getAdminProducts);
router.post("/product", adminStripeController.createProduct);
router.patch("/product/:id/status", adminStripeController.toggleProductStatus);

// Prices
router.post("/price", adminStripeController.createPrice);
router.patch("/price/:id/status", adminStripeController.togglePriceStatus);
router.put("/price/:id", adminStripeController.updatePrice);

module.exports = router;
