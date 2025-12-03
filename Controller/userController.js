const Model=require("../model/index")
const universalFunction=require("../universalFunction/universalFunction")
const code=require("../statusCode/index")
const message=require("../message/index")

const register = async (req, res, next) => {
    try {
      const [isEmailRegister, isMobileRegister] = await Promise.all([
        Model.user.findOne({ email: req.body.email }),
        Model.user.findOne({ phone: req.body.phone }),
      ]);
      if (isEmailRegister) {
        return universalFunction.successFunction(
          req,
          res,
          code.statusCodes.STATUS_CODE.BAD_REQUEST,
          message.messages.MESSAGES.EMAIL_ALREADY_EXIST
        );
      }
      if (isMobileRegister) {
        return universalFunction.successFunction(
          req,
          res,
          code.statusCodes.STATUS_CODE.BAD_REQUEST,
          message.messages.MESSAGES.MOBILE_ALREADY_REGISTER
        );
      }
      const accessToken = universalFunction.generateToken(req.body.email);
      const otpCode = Math.floor(Math.random() * 100000 + 100000);
      const hashPassword = await universalFunction.securePassword(
        req.body.password
      );
      req.body.accessToken = accessToken;
      const refreshToken = universalFunction.generateRefreshToken(req.body.email);
      
      req.body.password = hashPassword;
      req.body.otp = otpCode;
      const profile = await Model.user(req.body).save();
      
      // Save refresh token to DB
      await new Model.token({ userId: profile._id, token: refreshToken, type: 'refresh' }).save();
      
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Use secure in production
        sameSite: 'strict', // Adjust based on requirements
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return universalFunction.successFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.SUCCESS,
        message.messages.MESSAGES.REGISTER_SUCCESFULLY,
        profile
      );
    } catch (err) {
      next(err);
    }
  };


const login = async (req, res, next) => {
    try {
      const user = await Model.user.findOne({
        email: req.body.email
      });
      if (!user) {
        return res.status(400).json({
          message:"Please check your email.",
          statusCode:400
        })
      }
      const password = await universalFunction.verifyPassword(
        req.body.password,
        user.password
      );
      if (!password) {
        return res.status(400).json({
          message:"Please check your Password",
          statusCode:400
        })
      }
 
      const accessToken = await universalFunction.generateToken(user.email);
      const refreshToken = await universalFunction.generateRefreshToken(user.email);
      
      // Save refresh token to DB
      await new Model.token({ userId: user._id, token: refreshToken, type: 'refresh' }).save();

      user.accessToken = accessToken;
      // user.refreshToken = refreshToken; // Removed from body

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return universalFunction.successFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.SUCCESS,
        message.messages.MESSAGES.LOGIN_SUCCESFULLY,
        user
      );
    } catch (err) {
      next(err);
    }
};

const emailVerification = async (req, res, next) => {
  try {
    const isEmailExist = await Model.user.findOne({ email: req.body.email });
    if (!isEmailExist) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        message.messages.MESSAGES.INVALID_EMAIL
      );
    }
    if (isEmailExist.isEmailVerified) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        message.messages.MESSAGES.EMAIL_ALREADY_VERIFIED
      );
    }
    if (isEmailExist.otp != req.body.otp) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        message.messages.MESSAGES.INVALID_OTP
      );
    }
    const emailVerified = await Model.user.findOneAndUpdate(
      { email: req.body.email },
      { $set: { isEmailVerified: true, otp: "null" } },
      { new: true }
    );
    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      message.messages.MESSAGES.EMAIL_VERIFIED,
      emailVerified
    );
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const user = await Model.user.findOne({ email: req.user.email });
    const comparePassword = await universalFunction.verifyPassword(
      req.body.password,
      user.password
    );
    if (!comparePassword) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        message.messages.MESSAGES.INVALID_CURRENT_PASSWORD
      );
    }
    if (req.body.newPassword != req.body.confirmPassword) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        message.messages.MESSAGES.MATCH_PASSWORD_ERROR
      );
    }
    const hashPassword = await universalFunction.securePassword(
      req.body.newPassword
    );
    const newInfo = await Model.user.findOneAndUpdate(
      { email: user.email },
      { $set: { password: hashPassword } },
      { new: true }
    );
    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      message.messages.MESSAGES.PASSWORD_CHANGED,
      newInfo
    );
  } catch (err) {
    next(err);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const role = req.query.role || "";

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (role && ["standard", "admin"].includes(role)) {
      query.role = role;
    }

    const [users, total] = await Promise.all([
      Model.user
        .find(query)
        .select("-password -otp -accessToken")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Model.user.countDocuments(query),
    ]);

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      message.messages.MESSAGES.FETCHED_SUCCESSFULLY,
      {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      }
    );
  } catch (err) {
    next(err);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await Model.user
      .findById(req.params.id)
      .select("-password -otp -accessToken");

    if (!user) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        message.messages.MESSAGES.USER_NOT_EXIST
      );
    }

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      message.messages.MESSAGES.FETCHED_SUCCESSFULLY,
      user
    );
  } catch (err) {
    next(err);
  }
};


const deleteUser = async (req, res, next) => {
  try {
    const user = await Model.user.findByIdAndDelete(req.params.id);

    if (!user) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        message.messages.MESSAGES.USER_NOT_EXIST
      );
    }

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      "User deleted successfully",
      { id: req.params.id }
    );
  } catch (err) {
    next(err);
  }
};

module.exports={
    register,
    login,
    emailVerification,
    changePassword,
    listUsers,
    getUserById,
    deleteUser
}