const express = require("express");
const router = express.Router();
const { authController, googleAuthController } = require("../Controller/index");
const { auth } = require("../middleware/index");

router.get("/me", auth.authenticate, authController.me);
router.post("/refresh-tokens", authController.refreshTokens);
router.post('/logout', authController.logout);

// Google OAuth routes
router.post('/google', googleAuthController.googleAuth);

module.exports = router;
