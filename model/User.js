const Mongoose=require("mongoose")

const userSchema=new Mongoose.Schema({
    name:String,
    email:String,
    password:String,
    phone:Number,
    otp:String,
    accessToken:String,
    isEmailVerified:{
        type:Boolean,
        default:false
    },
    isPhoneVerified:{
        type:Boolean,
        default:false
    },
    role:{
        type:String,
        enum:["standard","admin"],
        default:"standard"
    }
}, {
    timestamps: true
})

const user=Mongoose.model("User",userSchema)

module.exports=user