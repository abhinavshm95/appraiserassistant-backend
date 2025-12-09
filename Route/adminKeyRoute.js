const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
    getAllCodes,
    getCodeStats,
    revokeCode,
    reactivateCode,
    makeCodeAvailable,
    exportCodes
} = require("../Controller/subscriptionKeyController");

// All routes require authentication and admin role
router.get("/", auth.authenticate, auth.isAdmin, getAllCodes);
router.get("/stats", auth.authenticate, auth.isAdmin, getCodeStats);
router.get("/export", auth.authenticate, auth.isAdmin, exportCodes);
router.post("/:codeId/revoke", auth.authenticate, auth.isAdmin, revokeCode);
router.post("/:codeId/reactivate", auth.authenticate, auth.isAdmin, reactivateCode);
router.post("/:codeId/make-available", auth.authenticate, auth.isAdmin, makeCodeAvailable);

module.exports = router;
