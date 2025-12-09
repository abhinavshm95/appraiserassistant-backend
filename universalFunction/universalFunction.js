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

// Extract device info from request for tracking active sessions
const getDeviceInfo = (req) => {
    const userAgent = req.headers['user-agent'] || '';

    // Get IP address (handle proxies like nginx, cloudflare, etc.)
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip ||
               'Unknown';

    // Parse browser from user agent
    let browser = 'Unknown';
    if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Edg')) browser = 'Edge';
    else if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Opera') || userAgent.includes('OPR')) browser = 'Opera';

    // Parse OS from user agent
    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac OS')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';

    // Parse device type
    let device = 'Desktop';
    if (userAgent.includes('Mobile') || userAgent.includes('Android')) device = 'Mobile';
    else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) device = 'Tablet';

    return {
        ip,
        userAgent,
        browser,
        os,
        device,
        loginAt: new Date()
    };
}

module.exports={
    successFunction,
    errorFunction,
    generateToken,
    generateRefreshToken,
    securePassword,
    verifyPassword,
    upload,
    getDeviceInfo
}