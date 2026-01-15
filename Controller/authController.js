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
			req.user,
		);
	} catch (err) {
		next(err);
	}
};

const refreshTokens = async (req, res, next) => {
	try {
		// Read from cookie
		const refreshToken = req.cookies.refreshToken;

		if (!refreshToken) {
			return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
				statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
				message: "Refresh token required",
			});
		}

		// Verify token in DB
		const tokenDoc = await Model.token.findOne({
			token: refreshToken,
			type: "refresh",
		});
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

		// Check if user is active
		if (user.isActive === false) {
			return res.status(code.statusCodes.STATUS_CODE.UNAUTHORIZED).json({
				statusCode: code.statusCodes.STATUS_CODE.UNAUTHORIZED,
				message: "Your account has been deactivated. Please contact support.",
			});
		}

		// Single-device login: Validate sessionVersion
		if (
			decoded.sessionVersion !== undefined &&
			decoded.sessionVersion !== user.sessionVersion
		) {
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
		const newAccessToken = universalFunction.generateToken(
			user.email,
			user.sessionVersion,
		);
		// Rotate refresh token
		const newRefreshToken = universalFunction.generateRefreshToken(
			user.email,
			user.sessionVersion,
		);

		// Save new token to DB
		await new Model.token({
			userId: user._id,
			token: newRefreshToken,
			type: "refresh",
		}).save();

		// Set new cookie
		res.cookie("refreshToken", newRefreshToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "Lax",
			maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
		});

		return universalFunction.successFunction(
			req,
			res,
			code.statusCodes.STATUS_CODE.SUCCESS,
			"Token refreshed successfully",
			{
				accessToken: newAccessToken,
				// refreshToken: newRefreshToken // Removed from body
			},
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
		res.clearCookie("refreshToken", {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "Lax",
		});

		return universalFunction.successFunction(
			req,
			res,
			code.statusCodes.STATUS_CODE.SUCCESS,
			"Logged out successfully",
		);
	} catch (err) {
		next(err);
	}
};

module.exports = {
	me,
	refreshTokens,
	logout,
};
