const Mongoose=require("mongoose")

const userSchema=new Mongoose.Schema({
    name:String,
    email:String,
    password:String,
    phone:String,
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
    },
    // OAuth fields
    googleId: {
        type: String,
        sparse: true,
        index: true
    },
    authProvider: {
        type: String,
        enum: ["local", "google"],
        default: "local"
    },
    profilePicture: {
        type: String
    },
    // Single-device login: increments on each login to invalidate old sessions
    sessionVersion: {
        type: Number,
        default: 1
    },
    // Current active device info
    activeDevice: {
        ip: String,
        userAgent: String,
        browser: String,
        os: String,
        device: String,
        loginAt: Date
    }
}, {
    timestamps: true
})

const user=Mongoose.model("User",userSchema)

module.exports=user