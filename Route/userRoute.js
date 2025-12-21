const express = require("express");
const router = express.Router();
const { userController } = require("../Controller/index");
const { auth } = require("../middleware/index");

router.post("/register", userController.register);
router.post("/login", userController.login);
router.put("/emailverification", userController.emailVerification);
router.put("/changePassword", auth.authenticate, userController.changePassword);

// Profile routes
router.get("/profile", auth.authenticate, userController.getProfile);
router.put("/profile", auth.authenticate, userController.updateProfile);

// Admin routes for user management
router.get("/list", auth.authenticate, auth.isAdmin, userController.listUsers);
router.get("/:id", auth.authenticate, auth.isAdmin, userController.getUserById);
router.delete("/:id", auth.authenticate, auth.isAdmin, userController.deleteUser);
router.put("/toggle-activation/:id", auth.authenticate, auth.isAdmin, userController.toggleUserActivation);

module.exports = router;
