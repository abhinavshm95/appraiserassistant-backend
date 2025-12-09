const Model = require("../model/index");
const universalFunction = require("../universalFunction/universalFunction");
const code = require("../statusCode/index");
const message = require("../message/index");
const jwt = require("jsonwebtoken");

const me = async (req, res, next) => {
  try {
    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      message.messages.MESSAGES.FETCHED_SUCCESSFULLY,
      req.user
    );
  } catch (err) {
    next(err);
  }
};

const refreshTokens = async (req, res, next) => {
  try {
    // The frontend might send refreshToken in body or cookie. 
    // Based on plan, we expect it in body for now as we didn't set up cookies explicitly in frontend yet (though axios has withCredentials=true).
    // Let's support body for now as per common JWT patterns if not using httpOnly cookies strictly.
    // Actually, the frontend code I saw earlier: `api.post('/auth/refresh-tokens')` - it didn't send data in body, so it might expect cookie?
    // Wait, the frontend code `api.post('/auth/refresh-tokens')` had no body.
    // If so, it MUST be in a cookie.
    // However, I didn't see cookie setting logic in `userController.js` login/register.
    // I just added `refreshToken` to the response body.
    // So the frontend needs to send it.
    // The frontend interceptor I wrote/saw: `api.post('/auth/refresh-tokens')`. It didn't pass data.
    // This means the frontend implementation I saw earlier was incomplete or assumed cookies.
    // Since I am implementing backend now, and I just added refreshToken to response body,
    // I should probably update frontend to store it and send it, OR update backend to set cookie.
    // Setting cookie is more secure.
    // BUT, the user asked to "implement auth/me & auth/refresh-token api".
    // I should probably stick to the simplest working solution first.
    // If I change frontend to send body, I need to update frontend.
    // If I change backend to set cookie, I need to update `userController` again.
    
    // Let's check `userController` again. I just added `refreshToken` to the returned user object.
    // So frontend receives it.
    // The frontend `api-client.ts` calls `api.post('/auth/refresh-tokens')`.
    // It does NOT pass the refresh token.
    // So currently, it won't work unless it's in a cookie.
    
    // I will assume for now that I should support receiving it in the body, AND I should update the frontend to send it.
    // OR, I can check if `req.cookies` has it.
    
    // Read from cookie
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
       return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
         statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
         message: "Refresh token required",
       });
    }

    // Verify token in DB
    const tokenDoc = await Model.token.findOne({ token: refreshToken, type: 'refresh' });
    if (!tokenDoc) {
        return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
            statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
            message: "Invalid or expired refresh token",
        });
    }

    const decoded = jwt.verify(refreshToken, "CARvadvdsvfdsv"); // Use env var in real app
    const user = await Model.user.findOne({ email: decoded.email });

    if (!user) {
       return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
         statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
         message: "User not found",
       });
    }

    // Single-device login: Validate sessionVersion
    if (decoded.sessionVersion !== undefined && decoded.sessionVersion !== user.sessionVersion) {
      // Delete the stale token
      await Model.token.findByIdAndDelete(tokenDoc._id);

      return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
        statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
        message: "Session expired. You have been logged in on another device.",
        code: "SESSION_INVALIDATED",
      });
    }

    // Delete old token
    await Model.token.findByIdAndDelete(tokenDoc._id);

    // Generate new tokens with SAME sessionVersion (not a new login, just refresh)
    const newAccessToken = universalFunction.generateToken(user.email, user.sessionVersion);
    // Rotate refresh token
    const newRefreshToken = universalFunction.generateRefreshToken(user.email, user.sessionVersion);

    // Save new token to DB
    await new Model.token({ userId: user._id, token: newRefreshToken, type: 'refresh' }).save();

    // Set new cookie
    res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      "Token refreshed successfully",
      {
        accessToken: newAccessToken,
        // refreshToken: newRefreshToken // Removed from body
      }
    );

  } catch (err) {
    return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
        statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
        message: "Invalid refresh token",
      });
  }
};

const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (refreshToken) {
      // Delete from DB if exists
      await Model.token.findOneAndDelete({ token: refreshToken });
    }

    // Clear cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      "Logged out successfully"
    );
  } catch (err) {
    next(err);
  }
};

module.exports = {
  me,
  refreshTokens,
  logout
};
