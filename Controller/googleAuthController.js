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
/**
 * Core logic to find or create a user based on Google ID token
 */
const findOrCreateUser = async (idToken, deviceInfo) => {
	// Verify the Google token
	const googleUser = await verifyGoogleToken(idToken);
	const { sub: googleId, email, name, picture, email_verified } = googleUser;

	if (!email) {
		throw new Error(
			"Email not provided by Google. Please ensure your Google account has an email.",
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
			if (email_verified) {
				user.isEmailVerified = true;
			}
			await user.save();
		} else {
			// Create new user
			user = await new Model.user({
				name: name || email.split("@")[0],
				email,
				googleId,
				authProvider: "google",
				profilePicture: picture,
				isEmailVerified: email_verified || false,
				role: "standard",
				sessionVersion: 1,
				activeDevice: deviceInfo,
				createdAt: new Date(),
				updatedAt: new Date(),
			}).save();
		}
	}

	// Single-device login: Increment sessionVersion
	const newSessionVersion = (user.sessionVersion || 0) + 1;
	user.sessionVersion = newSessionVersion;
	user.activeDevice = deviceInfo;

	// Generate new tokens
	const accessToken = universalFunction.generateToken(
		user.email,
		newSessionVersion,
	);
	const refreshToken = universalFunction.generateRefreshToken(
		user.email,
		newSessionVersion,
	);

	// Rotate refresh tokens
	await Model.token.deleteMany({ userId: user._id, type: "refresh" });
	await new Model.token({
		userId: user._id,
		token: refreshToken,
		type: "refresh",
	}).save();

	user.accessToken = accessToken;
	await user.save();

	return { user, accessToken, refreshToken };
};

/**
 * Google Sign-In/Sign-Up endpoint (JSON API)
 */
const googleAuth = async (req, res, next) => {
	try {
		const { idToken } = req.body;

		if (!idToken) {
			return universalFunction.errorFunction(
				req,
				res,
				code.statusCodes.STATUS_CODE.BAD_REQUEST,
				"Google ID token is required",
			);
		}

		const deviceInfo = universalFunction.getDeviceInfo(req);
		const { user, accessToken, refreshToken } = await findOrCreateUser(
			idToken,
			deviceInfo,
		);

		// Set refresh token as HttpOnly cookie
		res.cookie("refreshToken", refreshToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "Lax",
			maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
		});

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
			userResponse,
		);
	} catch (err) {
		console.error("Google auth error:", err);
		// If it's our known error, send it nicely, otherwise 500
		if (err.message && err.message.includes("Email not provided")) {
			return universalFunction.errorFunction(
				req,
				res,
				code.statusCodes.STATUS_CODE.BAD_REQUEST,
				err.message,
			);
		}
		return universalFunction.errorFunction(
			req,
			res,
			code.statusCodes.STATUS_CODE.UNAUTHORIZED,
			"Authentication failed",
		);
	}
};

/**
 * Validates Google OAuth2 redirect callback
 * This is called by Google via POST when ux_mode='redirect'
 */
const googleAuthCallback = async (req, res, next) => {
	try {
		// Google sends the ID token in the 'credential' body field for POST requests
		const { credential } = req.body;

		if (!credential) {
			// Redirect to frontend with error
			return res.redirect(
				`${process.env.FRONTEND_URL}/?error=No+credential+received`,
			);
		}

		const deviceInfo = universalFunction.getDeviceInfo(req);
		const { accessToken, refreshToken } = await findOrCreateUser(
			credential,
			deviceInfo,
		);

		// Set cookie
		res.cookie("refreshToken", refreshToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "Lax",
			maxAge: 7 * 24 * 60 * 60 * 1000,
		});

		// Redirect to frontend with token
		// Note: FRONTEND_URL should be defined in .env (e.g., http://localhost:5001)
		return res.redirect(`${process.env.FRONTEND_URL}/?token=${accessToken}`);
	} catch (err) {
		console.error("Google callback error:", err);
		return res.redirect(
			`${process.env.FRONTEND_URL}/?error=${encodeURIComponent(err.message || "Login failed")}`,
		);
	}
};

module.exports = {
	googleAuth,
	verifyGoogleToken,
	googleAuthCallback,
};
