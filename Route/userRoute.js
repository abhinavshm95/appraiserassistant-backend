const express=require("express")
const router=express.Router()
const {userController}=require("../Controller/index")
const { auth } = require("../middleware/index")

router.post("/register",userController.register)
router.post("/login",userController.login)
router.put("/emailverification",userController.emailVerification)
router.put("/changePassword", auth.authenticate, userController.changePassword)

// Admin routes for user management
router.get("/list", auth.authenticate, auth.isAdmin, userController.listUsers)
router.get("/:id", auth.authenticate, auth.isAdmin, userController.getUserById)
router.delete("/:id", auth.authenticate, auth.isAdmin, userController.deleteUser)

module.exports=router