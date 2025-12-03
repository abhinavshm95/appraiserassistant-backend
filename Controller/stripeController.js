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
                    cancelAtPeriodEnd: userSubscription.cancelAtPeriodEnd
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

module.exports = {
    createCheckoutSession,
    getSubscriptionStatus,
    getProducts,
    createPortalSession,
    syncStripeData
};
