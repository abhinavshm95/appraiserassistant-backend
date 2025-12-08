const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Model = require("../model/index");
const universalFunction = require("../universalFunction/universalFunction");
const code = require("../statusCode/index");
const message = require("../message/index");

/**
 * Create a Stripe checkout session for subscription
 */
const createCheckoutSession = async (req, res, next) => {
    try {
        const { priceId } = req.body;
        const user = req.user;

        if (!priceId) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Price ID is required"
            );
        }

        // Check if user already has a subscription record
        let userSubscription = await Model.userSubscription.findOne({ userId: user._id });
        let stripeCustomerId;

        if (userSubscription && userSubscription.stripeCustomerId) {
            stripeCustomerId = userSubscription.stripeCustomerId;
        } else {
            // Create a new Stripe customer
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: {
                    userId: user._id.toString()
                }
            });
            stripeCustomerId = customer.id;

            // Create or update user subscription record with customer ID
            if (userSubscription) {
                userSubscription.stripeCustomerId = stripeCustomerId;
                await userSubscription.save();
            } else {
                userSubscription = await Model.userSubscription.create({
                    userId: user._id,
                    stripeCustomerId: stripeCustomerId,
                    status: "incomplete"
                });
            }
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            mode: "subscription",
            payment_method_types: ["card"],
            line_items: [
                {
                    price: priceId,
                    quantity: 1
                }
            ],
            success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
            metadata: {
                userId: user._id.toString()
            }
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Checkout session created successfully",
            {
                sessionId: session.id,
                url: session.url
            }
        );
    } catch (err) {
        console.error("Error creating checkout session:", err);
        next(err);
    }
};

/**
 * Get subscription status for the current user
 */
const getSubscriptionStatus = async (req, res, next) => {
    try {
        const user = req.user;

        const userSubscription = await Model.userSubscription.findOne({ userId: user._id });

        if (!userSubscription) {
            return universalFunction.successFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.SUCCESS,
                "No subscription found",
                {
                    hasSubscription: false,
                    subscription: null
                }
            );
        }

        // Check if subscription is active
        const isActive = ["active", "trialing"].includes(userSubscription.status);

        // Code-based subscriptions don't have a stripeSubscriptionId
        const isCodeBased = !userSubscription.stripeSubscriptionId;

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Subscription status retrieved",
            {
                hasSubscription: isActive,
                subscription: {
                    status: userSubscription.status,
                    currentPeriodEnd: userSubscription.currentPeriodEnd,
                    cancelAtPeriodEnd: userSubscription.cancelAtPeriodEnd,
                    isCodeBased: isCodeBased
                }
            }
        );
    } catch (err) {
        console.error("Error getting subscription status:", err);
        next(err);
    }
};

/**
 * Get available products and prices
 */
const getProducts = async (req, res, next) => {
    try {
        const products = await Model.stripeProduct.find({ active: true });
        const prices = await Model.stripePrice.find({ active: true });

        // Map prices to products
        const productsWithPrices = products.map(product => {
            const productPrices = prices.filter(
                price => price.stripeProductId === product.stripeProductId
            );
            return {
                ...product.toObject(),
                prices: productPrices
            };
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Products retrieved successfully",
            productsWithPrices
        );
    } catch (err) {
        console.error("Error getting products:", err);
        next(err);
    }
};

/**
 * Create customer portal session for managing subscription
 */
const createPortalSession = async (req, res, next) => {
    try {
        const user = req.user;

        const userSubscription = await Model.userSubscription.findOne({ userId: user._id });

        if (!userSubscription || !userSubscription.stripeCustomerId) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "No subscription found for this user"
            );
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: userSubscription.stripeCustomerId,
            return_url: `${process.env.FRONTEND_URL}/subscription`
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Portal session created successfully",
            {
                url: session.url
            }
        );
    } catch (err) {
        console.error("Error creating portal session:", err);
        next(err);
    }
};

/**
 * Sync products and prices from Stripe (Admin only)
 */
const syncStripeData = async (req, res, next) => {
    try {
        // Fetch products from Stripe
        const stripeProducts = await stripe.products.list({ active: true, limit: 100 });

        for (const product of stripeProducts.data) {
            await Model.stripeProduct.findOneAndUpdate(
                { stripeProductId: product.id },
                {
                    stripeProductId: product.id,
                    name: product.name,
                    description: product.description || "",
                    active: product.active,
                    metadata: product.metadata
                },
                { upsert: true, new: true }
            );
        }

        // Fetch prices from Stripe
        const stripePrices = await stripe.prices.list({ active: true, limit: 100 });

        for (const price of stripePrices.data) {
            if (price.type === "recurring") {
                await Model.stripePrice.findOneAndUpdate(
                    { stripePriceId: price.id },
                    {
                        stripePriceId: price.id,
                        stripeProductId: price.product,
                        unitAmount: price.unit_amount,
                        currency: price.currency,
                        interval: price.recurring.interval,
                        intervalCount: price.recurring.interval_count,
                        active: price.active,
                        metadata: price.metadata
                    },
                    { upsert: true, new: true }
                );
            }
        }

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Stripe data synced successfully"
        );
    } catch (err) {
        console.error("Error syncing Stripe data:", err);
        next(err);
    }
};

/**
 * Redeem a subscription code
 * Activates a subscription for the user using a prepaid code
 */
const redeemSubscriptionCode = async (req, res, next) => {
    try {
        const { code: subscriptionCode } = req.body;
        const user = req.user;

        if (!subscriptionCode) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Subscription code is required"
            );
        }

        // Normalize the code (remove dashes and convert to uppercase)
        const normalizedCode = subscriptionCode.replace(/-/g, "").toUpperCase();
        const formattedCode = normalizedCode.match(/.{1,4}/g)?.join("-") || subscriptionCode.toUpperCase();

        // Find the code
        const codeRecord = await Model.bulkSubscriptionCode.findOne({ code: formattedCode });

        if (!codeRecord) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Invalid subscription code"
            );
        }

        // Check code status
        if (codeRecord.status === "redeemed") {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "This code has already been redeemed"
            );
        }

        if (codeRecord.status === "revoked") {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "This code has been revoked and is no longer valid"
            );
        }

        if (codeRecord.status === "expired" || new Date() > codeRecord.expiresAt) {
            // Update status if expired
            if (codeRecord.status !== "expired") {
                codeRecord.status = "expired";
                await codeRecord.save();
            }
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "This code has expired"
            );
        }

        // Check if user already has an active subscription
        const existingSubscription = await Model.userSubscription.findOne({
            userId: user._id,
            status: { $in: ["active", "trialing"] }
        });

        if (existingSubscription) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "You already have an active subscription. Please wait for it to expire or cancel it first."
            );
        }

        // Calculate subscription period
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() + codeRecord.subscriptionDurationDays);

        // Create or update user subscription
        let userSubscription = await Model.userSubscription.findOne({ userId: user._id });

        if (userSubscription) {
            // Update existing record
            userSubscription.stripePriceId = codeRecord.stripePriceId;
            userSubscription.stripeProductId = codeRecord.stripeProductId;
            userSubscription.status = "active";
            userSubscription.currentPeriodStart = now;
            userSubscription.currentPeriodEnd = periodEnd;
            userSubscription.cancelAtPeriodEnd = true; // Prepaid codes don't auto-renew
            userSubscription.canceledAt = null;
            userSubscription.endedAt = null;
            await userSubscription.save();
        } else {
            // Create new record - need to create a Stripe customer first for consistency
            let stripeCustomerId;
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: {
                    userId: user._id.toString()
                }
            });
            stripeCustomerId = customer.id;

            userSubscription = await Model.userSubscription.create({
                userId: user._id,
                stripeCustomerId: stripeCustomerId,
                stripePriceId: codeRecord.stripePriceId,
                stripeProductId: codeRecord.stripeProductId,
                status: "active",
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: true // Prepaid codes don't auto-renew
            });
        }

        // Mark code as redeemed
        codeRecord.status = "redeemed";
        codeRecord.redeemedBy = user._id;
        codeRecord.redeemedAt = now;
        await codeRecord.save();

        // Create transaction record
        await Model.transaction.create({
            userId: user._id,
            stripeCustomerId: userSubscription.stripeCustomerId,
            stripeEventId: `code_redemption_${codeRecord._id}`,
            rawEventType: "code_redemption",
            type: "subscription_created",
            status: "succeeded",
            amount: 0, // No payment - prepaid code
            currency: "usd",
            stripePriceId: codeRecord.stripePriceId,
            stripeProductId: codeRecord.stripeProductId,
            periodStart: now,
            periodEnd: periodEnd,
            description: `Subscription activated via prepaid code`,
            metadata: {
                codeId: codeRecord._id.toString(),
                code: codeRecord.code,
                purchaseId: codeRecord.purchaseId.toString(),
                subscriptionDurationDays: String(codeRecord.subscriptionDurationDays)
            }
        });

        // Get product name for response
        const product = await Model.stripeProduct.findOne({
            stripeProductId: codeRecord.stripeProductId
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Subscription activated successfully!",
            {
                subscription: {
                    status: "active",
                    productName: product?.name || "Subscription",
                    currentPeriodStart: now,
                    currentPeriodEnd: periodEnd,
                    durationDays: codeRecord.subscriptionDurationDays
                }
            }
        );
    } catch (err) {
        console.error("Error redeeming subscription code:", err);
        next(err);
    }
};

/**
 * Validate a subscription code (public endpoint - no auth required)
 * Returns code details without redeeming it
 */
const validateSubscriptionCode = async (req, res, next) => {
    try {
        const { code: subscriptionCode } = req.body;

        if (!subscriptionCode) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Subscription code is required"
            );
        }

        // Normalize the code (remove dashes and convert to uppercase)
        const normalizedCode = subscriptionCode.replace(/-/g, "").toUpperCase();
        const formattedCode = normalizedCode.match(/.{1,4}/g)?.join("-") || subscriptionCode.toUpperCase();

        // Find the code
        const codeRecord = await Model.bulkSubscriptionCode.findOne({ code: formattedCode });

        if (!codeRecord) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Invalid subscription code"
            );
        }

        // Check code status
        if (codeRecord.status === "redeemed") {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "This code has already been redeemed"
            );
        }

        if (codeRecord.status === "revoked") {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "This code has been revoked and is no longer valid"
            );
        }

        if (codeRecord.status === "expired" || new Date() > codeRecord.expiresAt) {
            // Update status if expired
            if (codeRecord.status !== "expired") {
                codeRecord.status = "expired";
                await codeRecord.save();
            }
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "This code has expired"
            );
        }

        // Get product details
        const product = await Model.stripeProduct.findOne({
            stripeProductId: codeRecord.stripeProductId
        });

        const price = await Model.stripePrice.findOne({
            stripePriceId: codeRecord.stripePriceId
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Valid subscription code",
            {
                valid: true,
                productName: product?.name || "Subscription",
                productDescription: product?.description || "",
                durationDays: codeRecord.subscriptionDurationDays,
                expiresAt: codeRecord.expiresAt,
                originalPrice: price?.unitAmount ? (price.unitAmount / 100).toFixed(2) : null,
                currency: price?.currency?.toUpperCase() || "USD"
            }
        );
    } catch (err) {
        console.error("Error validating subscription code:", err);
        next(err);
    }
};

module.exports = {
    createCheckoutSession,
    getSubscriptionStatus,
    getProducts,
    createPortalSession,
    syncStripeData,
    redeemSubscriptionCode,
    validateSubscriptionCode
};
