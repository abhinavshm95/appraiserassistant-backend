const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
    generateKeys,
    getKeys,
    getKeyStats,
    revokeKey,
    exportKeys
} = require("../Controller/subscriptionKeyController");

// All routes require authentication and admin role
router.post("/generate", auth.authenticate, auth.isAdmin, generateKeys);
router.get("/", auth.authenticate, auth.isAdmin, getKeys);
router.get("/stats", auth.authenticate, auth.isAdmin, getKeyStats);
router.get("/export", auth.authenticate, auth.isAdmin, exportKeys);
router.post("/:keyId/revoke", auth.authenticate, auth.isAdmin, revokeKey);

module.exports = router;
