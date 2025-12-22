const express = require("express");
const controller = require("../Controller/adminDashboardController");
const { authenticate, isAdmin } = require("../middleware/auth");
const router = express.Router();

router.get("/stats", authenticate, isAdmin, controller.getDashboardStats);

module.exports = router;
