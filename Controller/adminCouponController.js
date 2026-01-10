const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Model = require("../model/index");
const universalFunction = require("../universalFunction/universalFunction");
const code = require("../statusCode/index");

/**
 * Get all coupons
 */
const getCoupons = async (req, res, next) => {
    try {
        const coupons = await Model.stripeCoupon.find().sort({ createdAt: -1 }).lean();
        
        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Coupons retrieved successfully",
            coupons
        );
    } catch (err) {
        console.error("Error getting coupons:", err);
        next(err);
    }
};

/**
 * Create a new coupon
 */
const createCoupon = async (req, res, next) => {
    try {
        const { 
            name, 
            percentOff, 
            amountOff, 
            duration, 
            durationInMonths, 
            appliesToProducts 
        } = req.body;

        if (!name) {
            return universalFunction.errorFunction(req, res, code.statusCodes.STATUS_CODE.BAD_REQUEST, "Name is required");
        }
        if (!duration) {
            return universalFunction.errorFunction(req, res, code.statusCodes.STATUS_CODE.BAD_REQUEST, "Duration is required");
        }
        if (!percentOff && !amountOff) {
            return universalFunction.errorFunction(req, res, code.statusCodes.STATUS_CODE.BAD_REQUEST, "Either percentOff or amountOff is required");
        }
        if (duration === 'repeating' && !durationInMonths) {
            return universalFunction.errorFunction(req, res, code.statusCodes.STATUS_CODE.BAD_REQUEST, "Duration in months is required for repeating coupons");
        }

        const couponPayload = {
            name,
            duration,
        };

        if (percentOff) {
            couponPayload.percent_off = percentOff;
        } else {
            couponPayload.amount_off = amountOff;
            couponPayload.currency = 'usd'; // Default to USD
        }

        if (duration === 'repeating') {
            couponPayload.duration_in_months = durationInMonths;
        }

        // Handle product restrictions
        if (appliesToProducts && appliesToProducts.length > 0) {
            couponPayload.applies_to = {
                products: appliesToProducts
            };
        }

        // Create in Stripe
        const stripeCoupon = await stripe.coupons.create(couponPayload);

        // Save to DB
        const newCoupon = await Model.stripeCoupon.create({
            stripeCouponId: stripeCoupon.id,
            name: stripeCoupon.name,
            percentOff: stripeCoupon.percent_off,
            amountOff: stripeCoupon.amount_off,
            currency: stripeCoupon.currency,
            duration: stripeCoupon.duration,
            durationInMonths: stripeCoupon.duration_in_months,
            appliesToProducts: appliesToProducts || [],
            active: stripeCoupon.valid,
            metadata: stripeCoupon.metadata
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.CREATED,
            "Coupon created successfully",
            newCoupon
        );

    } catch (err) {
        console.error("Error creating coupon:", err);
        next(err);
    }
};

/**
 * Delete a coupon
 */
const deleteCoupon = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Delete from Stripe
        await stripe.coupons.del(id);

        // Delete from DB
        await Model.stripeCoupon.deleteOne({ stripeCouponId: id });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Coupon deleted successfully",
            {}
        );

    } catch (err) {
        console.error("Error deleting coupon:", err);
        next(err);
    }
};

module.exports = {
    getCoupons,
    createCoupon,
    deleteCoupon
};
