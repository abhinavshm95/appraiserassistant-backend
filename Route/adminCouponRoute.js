const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const controller = require("../Controller/adminCouponController");

// Get all coupons
router.get("/coupons", auth.authenticate, auth.isAdmin, controller.getCoupons);

// Create new coupon
router.post("/coupon", auth.authenticate, auth.isAdmin, controller.createCoupon);

// Delete coupon
router.delete("/coupon/:id", auth.authenticate, auth.isAdmin, controller.deleteCoupon);

module.exports = router;
