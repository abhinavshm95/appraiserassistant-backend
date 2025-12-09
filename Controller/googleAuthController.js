const { OAuth2Client } = require("google-auth-library");
const Model = require("../model/index");
const universalFunction = require("../universalFunction/universalFunction");
const code = require("../statusCode/index");
const message = require("../message/index");

// Initialize Google OAuth client
const getGoogleClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID environment variable is not set");
  }
  return new OAuth2Client(clientId);
};

/**
 * Verify Google ID token and return user info
 * @param {string} idToken - The ID token from Google Sign-In
 * @returns {Object} - Google user payload
 */
const verifyGoogleToken = async (idToken) => {
  const client = getGoogleClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
};

/**
 * Google Sign-In/Sign-Up endpoint
 * Handles both new user registration and existing user login via Google
 *
 * Flow:
 * 1. Verify Google ID token
 * 2. Check if user exists by googleId
 * 3. If not, check if user exists by email (for account linking)
 * 4. If email exists without googleId, link accounts
 * 5. If no user found, create new user
 * 6. Generate tokens and return user
 */
const googleAuth = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        "Google ID token is required"
      );
    }

    // Verify the Google token
    let googleUser;
    try {
      googleUser = await verifyGoogleToken(idToken);
    } catch (error) {
      console.error("Google token verification failed:", error.message);
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.UNAUTHORIZED,
        "Invalid Google token"
      );
    }

    const { sub: googleId, email, name, picture, email_verified } = googleUser;

    if (!email) {
      return universalFunction.errorFunction(
        req,
        res,
        code.statusCodes.STATUS_CODE.BAD_REQUEST,
        "Email not provided by Google. Please ensure your Google account has an email."
      );
    }

    // First, try to find user by Google ID
    let user = await Model.user.findOne({ googleId });

    if (!user) {
      // Check if user with this email already exists (for account linking)
      user = await Model.user.findOne({ email });

      if (user) {
        // Link Google account to existing user
        user.googleId = googleId;
        user.authProvider = user.authProvider === "local" ? "local" : "google";
        if (picture && !user.profilePicture) {
          user.profilePicture = picture;
        }
        // Mark email as verified since Google verified it
        if (email_verified) {
          user.isEmailVerified = true;
        }
        await user.save();
      } else {
        // Create new user with sessionVersion = 1
        user = await new Model.user({
          name: name || email.split("@")[0],
          email,
          googleId,
          authProvider: "google",
          profilePicture: picture,
          isEmailVerified: email_verified || false,
          role: "standard",
          sessionVersion: 1,
          activeDevice: universalFunction.getDeviceInfo(req),
        }).save();
      }
    }

    // Single-device login: Increment sessionVersion to invalidate all previous sessions
    const newSessionVersion = (user.sessionVersion || 0) + 1;
    const deviceInfo = universalFunction.getDeviceInfo(req);
    user.sessionVersion = newSessionVersion;
    user.activeDevice = deviceInfo;

    // Generate new tokens with sessionVersion
    const accessToken = universalFunction.generateToken(user.email, newSessionVersion);
    const refreshToken = universalFunction.generateRefreshToken(user.email, newSessionVersion);

    // Delete ALL existing refresh tokens for this user (invalidate old sessions)
    await Model.token.deleteMany({ userId: user._id, type: 'refresh' });

    // Save new refresh token to DB
    await new Model.token({
      userId: user._id,
      token: refreshToken,
      type: "refresh",
    }).save();

    // Update user's access token and sessionVersion
    user.accessToken = accessToken;
    await user.save();

    // Set refresh token as HttpOnly cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Return user data (exclude sensitive fields)
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      profilePicture: user.profilePicture,
      authProvider: user.authProvider,
      accessToken,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return universalFunction.successFunction(
      req,
      res,
      code.statusCodes.STATUS_CODE.SUCCESS,
      "Google authentication successful",
      userResponse
    );
  } catch (err) {
    console.error("Google auth error:", err);
    next(err);
  }
};

module.exports = {
  googleAuth,
  verifyGoogleToken,
};
