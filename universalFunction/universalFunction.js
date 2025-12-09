const jwt=require("jsonwebtoken")
const bcrypt=require("bcrypt")
const multer=require("multer")

const successFunction=(req,res,statusCode,message,data)=>{
    res.status(statusCode).send({
        statusCode:statusCode,
        message:message,
        data:data
    })
}

const errorFunction=(req,res,statusCode,message)=>{
    res.status(statusCode).send({
        statusCode:statusCode,
        message:message
    })
}

const generateToken=(email, sessionVersion)=>{
    const accessToken=jwt.sign({email:email, sessionVersion: sessionVersion},"CARvadvdsvfdsv")
    return accessToken
}

const securePassword=async(password)=>{
    const hashPassword=await bcrypt.hash(password,10) 
    return hashPassword
}

const verifyPassword=async(password,hashPassword)=>{
    const comparePassword=await bcrypt.compare(password,hashPassword)
    return comparePassword
}

const config=multer.diskStorage({
    destination:(req,file,callback)=>{
        callback(null,"./uploads")
    },
    filename:(req,file,callback)=>{
        callback(null,`image-${Date.now()}${file.originalname}`)
    }
})

const isimg=(req,file,callback)=>{
    if(file.mimetype=="image/jpeg" || file.mimetype=="image/png"){
        callback(null,true)
    }
    else{
        callback(new Error("Only image can be uploaded"))
    }
}

const upload=multer({
    storage:config,
    fileFilter:isimg
})

const generateRefreshToken=(email, sessionVersion)=>{
    const refreshToken=jwt.sign({email:email, sessionVersion: sessionVersion},"CARvadvdsvfdsv", { expiresIn: '7d' })
    return refreshToken
}

module.exports={
    successFunction,
    errorFunction,
    generateToken,
    generateRefreshToken,
    securePassword,
    verifyPassword,
    upload
}