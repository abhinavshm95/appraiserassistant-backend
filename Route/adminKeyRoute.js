const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
    getAllCodes,
    getCodeStats,
    revokeCode,
    exportCodes
} = require("../Controller/subscriptionKeyController");

// All routes require authentication and admin role
router.get("/", auth.authenticate, auth.isAdmin, getAllCodes);
router.get("/stats", auth.authenticate, auth.isAdmin, getCodeStats);
router.get("/export", auth.authenticate, auth.isAdmin, exportCodes);
router.post("/:codeId/revoke", auth.authenticate, auth.isAdmin, revokeCode);

module.exports = router;
