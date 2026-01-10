const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Model = require("../model/index");
const universalFunction = require("../universalFunction/universalFunction");
const code = require("../statusCode/index");

/**
 * Get all products with their prices (Admin only)
 */
const getAdminProducts = async (req, res, next) => {
    try {
        const products = await Model.stripeProduct.find().lean();
        const prices = await Model.stripePrice.find().lean();

        const data = products.map(product => {
            const productPrices = prices.filter(p => p.stripeProductId === product.stripeProductId);
            return {
                ...product,
                prices: productPrices
            };
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Products retrieved successfully",
            data
        );
    } catch (err) {
        console.error("Error getting admin products:", err);
        next(err);
    }
};

/**
 * Create a new product in Stripe and DB
 */
const createProduct = async (req, res, next) => {
    try {
        const { name, description, active } = req.body;

        if (!name) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Product name is required"
            );
        }

        // Create in Stripe
        const product = await stripe.products.create({
            name,
            description,
            active: active !== false // Default true
        });

        // Save to DB
        const newProduct = await Model.stripeProduct.create({
            stripeProductId: product.id,
            name: product.name,
            description: product.description,
            active: product.active,
            metadata: product.metadata
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.CREATED,
            "Product created successfully",
            newProduct
        );
    } catch (err) {
        console.error("Error creating product:", err);
        next(err);
    }
};

/**
 * Toggle product active status
 */
const toggleProductStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { active } = req.body;

        if (active === undefined) {
             return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Active status is required"
            );
        }

        const productRow = await Model.stripeProduct.findOne({ stripeProductId: id });
        if (!productRow) {
             return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.NOT_FOUND,
                "Product not found"
            );
        }

        // Update Stripe
        await stripe.products.update(id, { active });

        // Update DB
        productRow.active = active;
        await productRow.save();

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            `Product ${active ? 'activated' : 'deactivated'} successfully`,
            productRow
        );

    } catch (err) {
        console.error("Error toggling product status:", err);
        next(err);
    }
};


/**
 * Create a new price in Stripe and DB
 */
const createPrice = async (req, res, next) => {
    try {
        const { productId, unitAmount, interval, intervalCount, currency, active } = req.body;

        if (!productId || !unitAmount || !interval) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "productId, unitAmount (in cents), and interval are required"
            );
        }

        // Create in Stripe
        const price = await stripe.prices.create({
            product: productId,
            unit_amount: unitAmount,
            currency: currency || 'usd',
            recurring: {
                interval: interval,
                interval_count: intervalCount || 1
            },
            active: active !== false
        });

        // Save to DB
        const newPrice = await Model.stripePrice.create({
            stripePriceId: price.id,
            stripeProductId: productId,
            unitAmount: price.unit_amount,
            currency: price.currency,
            interval: price.recurring.interval,
            intervalCount: price.recurring.interval_count,
            active: price.active,
            metadata: price.metadata
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.CREATED,
            "Price created successfully",
            newPrice
        );

    } catch (err) {
        console.error("Error creating price:", err);
        next(err);
    }
};

/**
 * Toggle price active status
 */
const togglePriceStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { active } = req.body;

        if (active === undefined) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.BAD_REQUEST,
                "Active status is required"
            );
        }

        const priceRow = await Model.stripePrice.findOne({ stripePriceId: id });
        if (!priceRow) {
             return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.NOT_FOUND,
                "Price not found"
            );
        }

        // Update Stripe
        await stripe.prices.update(id, { active });

        // Update DB
        priceRow.active = active;
        await priceRow.save();

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            `Price ${active ? 'activated' : 'deactivated'} successfully`,
            priceRow
        );

    } catch (err) {
        console.error("Error toggling price status:", err);
        next(err);
    }
};

/**
 * Update logic:
 * 1. Check if price is used in ANY subscription.
 * 2. If USED -> Block update of amount/interval (return error).
 *    (Note: If user just wants to rename or change metadata, that might include in future, but for now we focus on pricing).
 *    Actually, Stripe prices are immutable regarding amount/currency/interval.
 *    So "Updating" a price effectively means "Deactivating old one and Creating new one".
 *    BUT, if the old one is used, we might want to keep it valid for existing users but stop new signups?
 *    The requirement says: "admin update pricing until no subscription is assigned... Once any user has subscription... admin CANNOT update or remove".
 *    This implies if USED, we cannot even swap it? Or we can't change it.
 *    Since Stripe prices are immutable anyway, we can't "change" the amount of `price_123`. We would have to create `price_456`.
 *    So if the request is "Change Price A to $20", we interpret it as:
 *    - Check if Price A is used.
 *       - If YES: ERROR "Cannot update pricing because active subscriptions exist."
 *       - If NO: Deactivate Price A (or delete? Stripe allows delete if not used, but safe to archive). Create Price B.
 */
const updatePrice = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { unitAmount, interval, intervalCount, active } = req.body;

        // Check if price exists
        const oldPrice = await Model.stripePrice.findOne({ stripePriceId: id });
        if (!oldPrice) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.NOT_FOUND,
                "Price not found"
            );
        }

        // Check for subscriptions using this price
        // We check UserSubscription for ANY record with this stripePriceId
        // The requirement says "until no subscription is assigned". Even if cancelled? "Once ANY user has ANY subscription".
        // I'll assume if there is a UserSubscription record, it's "assigned".
        // To be safer, maybe checks for active status? But safest is "if it was ever used".
        const usageCount = await Model.userSubscription.countDocuments({ stripePriceId: id });
        
        if (usageCount > 0) {
            return universalFunction.errorFunction(
                req,
                res,
                code.statusCodes.STATUS_CODE.FORBIDDEN,
                "Cannot update price: One or more subscriptions are assigned to this pricing plan."
            );
        }

        // If not used, we can "Update" it.
        // Since Stripe Price is immutable, we must archive/deactivate the old one and create a new one.
        // UNLESS the update is just "active" status? No, that's handled by togglePriceStatus. 
        // We assume this endpoint is for changing the configuration (amount/interval).

        // Deactivate old price
        await stripe.prices.update(id, { active: false });
        // Mark old price as inactive in DB (or delete? Requirement says "Do not remove existing product and pricing", so keep inactive)
        oldPrice.active = false;
        await oldPrice.save();

        // Create new price
        const newPriceStripe = await stripe.prices.create({
            product: oldPrice.stripeProductId,
            unit_amount: unitAmount,
            currency: 'usd', // Assuming USD for now
            recurring: {
                interval: interval,
                interval_count: intervalCount || 1
            },
            active: active !== false
        });

        const newPriceDB = await Model.stripePrice.create({
            stripePriceId: newPriceStripe.id,
            stripeProductId: oldPrice.stripeProductId,
            unitAmount: newPriceStripe.unit_amount,
            currency: newPriceStripe.currency,
            interval: newPriceStripe.recurring.interval,
            intervalCount: newPriceStripe.recurring.interval_count,
            active: newPriceStripe.active,
            metadata: newPriceStripe.metadata
        });

        return universalFunction.successFunction(
            req,
            res,
            code.statusCodes.STATUS_CODE.SUCCESS,
            "Price updated (Old price archived, new price created)",
            newPriceDB
        );

    } catch (err) {
        console.error("Error updating price:", err);
        next(err);
    }
};

module.exports = {
    getAdminProducts,
    createProduct,
    toggleProductStatus,
    createPrice,
    togglePriceStatus,
    updatePrice
};
