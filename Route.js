const express=require("express")
const Route=require("./Route/")
const router=express.Router()

router.use("/user",Route.userRoute)
router.use("/car",Route.carRoute)
router.use("/auth",Route.authRoute)
router.use("/stripe",Route.stripeRoute)
router.use("/admin/subscriptions",Route.adminSubscriptionRoute)
router.use("/admin/bulk-subscriptions",Route.adminBulkSubscriptionRoute)

module.exports=router