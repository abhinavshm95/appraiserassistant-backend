const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Model = require("../model/index");

/**
 * Stripe Webhook Handler
 *
 * Security measures implemented:
 * 1. Signature verification using STRIPE_WEBHOOK_SECRET
 * 2. Idempotency check using stripeEventId to prevent duplicate processing
 * 3. Raw body parsing (configured in route) for signature verification
 * 4. Event type validation
 */

// Set of processed event IDs for in-memory deduplication (backup for DB check)
const processedEvents = new Set();
const MAX_PROCESSED_EVENTS = 10000;

/**
 * Clean up old processed events to prevent memory leak
 */
const cleanupProcessedEvents = () => {
    if (processedEvents.size > MAX_PROCESSED_EVENTS) {
        const eventsArray = Array.from(processedEvents);
        const toRemove = eventsArray.slice(0, eventsArray.length - MAX_PROCESSED_EVENTS / 2);
        toRemove.forEach(id => processedEvents.delete(id));
    }
};

/**
 * Main webhook handler
 */
const handleWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error("STRIPE_WEBHOOK_SECRET is not configured");
        return res.status(500).json({ error: "Webhook secret not configured" });
    }

    let event;

    try {
        // Verify webhook signature using raw body
        // On Vercel, req.body from express.raw() is a Buffer - convert to string for Stripe
        const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;

        // Debug logging (remove after fixing)
        console.log("Webhook received:", {
            bodyType: typeof req.body,
            isBuffer: Buffer.isBuffer(req.body),
            bodyLength: req.body?.length,
            sigHeader: sig?.substring(0, 50) + "...",
            hasWebhookSecret: !!webhookSecret
        });

        event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        console.error("Debug info:", {
            bodyType: typeof req.body,
            isBuffer: Buffer.isBuffer(req.body),
            bodyPreview: typeof req.body === 'string' ? req.body.substring(0, 100) : 'N/A'
        });
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    // Idempotency check - prevent duplicate processing
    if (processedEvents.has(event.id)) {
        console.log(`Event ${event.id} already processed (in-memory cache)`);
        return res.status(200).json({ received: true, duplicate: true });
    }

    // Check database for duplicate event
    const existingTransaction = await Model.transaction.findOne({ stripeEventId: event.id });
    if (existingTransaction) {
        console.log(`Event ${event.id} already processed (database check)`);
        return res.status(200).json({ received: true, duplicate: true });
    }

    console.log(`Processing webhook event: ${event.type} (${event.id})`);

    try {
        // Route event to appropriate handler
        switch (event.type) {
            // Checkout events
            case "checkout.session.completed":
                await handleCheckoutSessionCompleted(event);
                break;
            case "checkout.session.expired":
                await handleCheckoutSessionExpired(event);
                break;

            // Subscription lifecycle events
            case "customer.subscription.created":
                await handleSubscriptionCreated(event);
                break;
            case "customer.subscription.updated":
                await handleSubscriptionUpdated(event);
                break;
            case "customer.subscription.deleted":
                await handleSubscriptionDeleted(event);
                break;
            case "customer.subscription.paused":
                await handleSubscriptionPaused(event);
                break;
            case "customer.subscription.resumed":
                await handleSubscriptionResumed(event);
                break;
            case "customer.subscription.trial_will_end":
                await handleTrialWillEnd(event);
                break;

            // Invoice events
            case "invoice.paid":
                await handleInvoicePaid(event);
                break;
            case "invoice.payment_succeeded":
                await handleInvoicePaymentSucceeded(event);
                break;
            case "invoice.payment_failed":
                await handleInvoicePaymentFailed(event);
                break;
            case "invoice.upcoming":
                await handleInvoiceUpcoming(event);
                break;
            case "invoice.finalized":
                await handleInvoiceFinalized(event);
                break;

            // Payment intent events
            case "payment_intent.succeeded":
                await handlePaymentIntentSucceeded(event);
                break;
            case "payment_intent.payment_failed":
                await handlePaymentIntentFailed(event);
                break;

            // Charge events
            case "charge.refunded":
                await handleChargeRefunded(event);
                break;

            // Customer events
            case "customer.updated":
                await handleCustomerUpdated(event);
                break;

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        // Mark event as processed
        processedEvents.add(event.id);
        cleanupProcessedEvents();

        return res.status(200).json({ received: true });
    } catch (err) {
        console.error(`Error processing webhook event ${event.type}:`, err);
        // Return 200 to prevent Stripe from retrying (we log the error for investigation)
        // In production, you might want to return 500 for certain errors to trigger retries
        return res.status(200).json({ received: true, error: err.message });
    }
};

/**
 * Handle checkout.session.completed
 * Called when a checkout session is successfully completed
 */
const handleCheckoutSessionCompleted = async (event) => {
    const session = event.data.object;
    console.log(`Checkout session completed: ${session.id}`);

    if (session.mode !== "subscription") {
        console.log("Checkout session is not for subscription, skipping");
        return;
    }

    const customerId = session.customer;
    const subscriptionId = session.subscription;
    const userId = session.metadata?.userId;

    if (!userId) {
        console.error("No userId in checkout session metadata");
        return;
    }

    // Fetch the full subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Update user subscription record
    await Model.userSubscription.findOneAndUpdate(
        { userId: userId },
        {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            stripePriceId: subscription.items.data[0]?.price?.id,
            stripeProductId: subscription.items.data[0]?.price?.product,
            status: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end
        },
        { upsert: true, new: true }
    );

    console.log(`Subscription activated for user ${userId}`);
};

/**
 * Handle checkout.session.expired
 */
const handleCheckoutSessionExpired = async (event) => {
    const session = event.data.object;
    console.log(`Checkout session expired: ${session.id}`);
    // Optionally track abandoned checkouts
};

/**
 * Handle customer.subscription.created
 */
const handleSubscriptionCreated = async (event) => {
    const subscription = event.data.object;
    console.log(`Subscription created: ${subscription.id}`);

    const userSubscription = await Model.userSubscription.findOne({
        stripeCustomerId: subscription.customer
    });

    if (!userSubscription) {
        console.log("No user subscription found for customer:", subscription.customer);
        return;
    }

    await Model.userSubscription.findOneAndUpdate(
        { stripeCustomerId: subscription.customer },
        {
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.items.data[0]?.price?.id,
            stripeProductId: subscription.items.data[0]?.price?.product,
            status: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end
        }
    );

    // Create transaction record
    await Model.transaction.create({
        userId: userSubscription.userId,
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        stripeEventId: event.id,
        rawEventType: event.type,
        type: "subscription_created",
        status: "succeeded",
        amount: subscription.items.data[0]?.price?.unit_amount || 0,
        currency: subscription.currency,
        stripePriceId: subscription.items.data[0]?.price?.id,
        stripeProductId: subscription.items.data[0]?.price?.product,
        periodStart: new Date(subscription.current_period_start * 1000),
        periodEnd: new Date(subscription.current_period_end * 1000),
        description: "Subscription created"
    });
};

/**
 * Handle customer.subscription.updated
 */
const handleSubscriptionUpdated = async (event) => {
    const subscription = event.data.object;
    const previousAttributes = event.data.previous_attributes;
    console.log(`Subscription updated: ${subscription.id}`);

    const userSubscription = await Model.userSubscription.findOne({
        stripeSubscriptionId: subscription.id
    });

    if (!userSubscription) {
        console.log("No user subscription found for subscription:", subscription.id);
        return;
    }

    // Update subscription details
    await Model.userSubscription.findOneAndUpdate(
        { stripeSubscriptionId: subscription.id },
        {
            stripePriceId: subscription.items.data[0]?.price?.id,
            stripeProductId: subscription.items.data[0]?.price?.product,
            status: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
            endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null
        }
    );

    // Create transaction record for significant updates
    const isStatusChange = previousAttributes?.status && previousAttributes.status !== subscription.status;
    const isPlanChange = previousAttributes?.items;
    const isCancellation = previousAttributes?.cancel_at_period_end !== undefined;

    if (isStatusChange || isPlanChange || isCancellation) {
        await Model.transaction.create({
            userId: userSubscription.userId,
            stripeCustomerId: subscription.customer,
            stripeSubscriptionId: subscription.id,
            stripeEventId: event.id,
            rawEventType: event.type,
            type: "subscription_updated",
            status: "succeeded",
            amount: subscription.items.data[0]?.price?.unit_amount || 0,
            currency: subscription.currency,
            stripePriceId: subscription.items.data[0]?.price?.id,
            stripeProductId: subscription.items.data[0]?.price?.product,
            periodStart: new Date(subscription.current_period_start * 1000),
            periodEnd: new Date(subscription.current_period_end * 1000),
            description: getSubscriptionUpdateDescription(previousAttributes, subscription),
            metadata: {
                previousStatus: previousAttributes?.status || null,
                newStatus: subscription.status,
                cancelAtPeriodEnd: String(subscription.cancel_at_period_end)
            }
        });
    }
};

/**
 * Generate description for subscription update
 */
const getSubscriptionUpdateDescription = (previousAttributes, subscription) => {
    const changes = [];

    if (previousAttributes?.status) {
        changes.push(`Status changed from ${previousAttributes.status} to ${subscription.status}`);
    }
    if (previousAttributes?.cancel_at_period_end !== undefined) {
        changes.push(subscription.cancel_at_period_end ?
            "Subscription scheduled for cancellation" :
            "Subscription cancellation reversed");
    }
    if (previousAttributes?.items) {
        changes.push("Subscription plan changed");
    }

    return changes.length > 0 ? changes.join(". ") : "Subscription updated";
};

/**
 * Handle customer.subscription.deleted
 */
const handleSubscriptionDeleted = async (event) => {
    const subscription = event.data.object;
    console.log(`Subscription deleted: ${subscription.id}`);

    const userSubscription = await Model.userSubscription.findOne({
        stripeSubscriptionId: subscription.id
    });

    if (!userSubscription) {
        console.log("No user subscription found for subscription:", subscription.id);
        return;
    }

    await Model.userSubscription.findOneAndUpdate(
        { stripeSubscriptionId: subscription.id },
        {
            status: "canceled",
            canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : new Date(),
            endedAt: new Date()
        }
    );

    await Model.transaction.create({
        userId: userSubscription.userId,
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        stripeEventId: event.id,
        rawEventType: event.type,
        type: "subscription_canceled",
        status: "succeeded",
        amount: 0,
        currency: subscription.currency,
        stripePriceId: subscription.items.data[0]?.price?.id,
        stripeProductId: subscription.items.data[0]?.price?.product,
        description: "Subscription canceled"
    });
};

/**
 * Handle customer.subscription.paused
 */
const handleSubscriptionPaused = async (event) => {
    const subscription = event.data.object;
    console.log(`Subscription paused: ${subscription.id}`);

    await Model.userSubscription.findOneAndUpdate(
        { stripeSubscriptionId: subscription.id },
        { status: "paused" }
    );
};

/**
 * Handle customer.subscription.resumed
 */
const handleSubscriptionResumed = async (event) => {
    const subscription = event.data.object;
    console.log(`Subscription resumed: ${subscription.id}`);

    await Model.userSubscription.findOneAndUpdate(
        { stripeSubscriptionId: subscription.id },
        {
            status: subscription.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000)
        }
    );
};

/**
 * Handle customer.subscription.trial_will_end
 * Triggered 3 days before trial ends
 */
const handleTrialWillEnd = async (event) => {
    const subscription = event.data.object;
    console.log(`Trial will end for subscription: ${subscription.id}`);
    // Optionally send notification to user
};

/**
 * Handle invoice.paid
 */
const handleInvoicePaid = async (event) => {
    const invoice = event.data.object;
    console.log(`Invoice paid: ${invoice.id}`);

    if (!invoice.subscription) {
        console.log("Invoice is not for a subscription");
        return;
    }

    const userSubscription = await Model.userSubscription.findOne({
        stripeSubscriptionId: invoice.subscription
    });

    if (!userSubscription) {
        console.log("No user subscription found for invoice");
        return;
    }

    // Fetch charge details for payment method info
    let paymentMethodDetails = {};
    if (invoice.charge) {
        try {
            const charge = await stripe.charges.retrieve(invoice.charge);
            if (charge.payment_method_details?.card) {
                paymentMethodDetails = {
                    type: "card",
                    brand: charge.payment_method_details.card.brand,
                    last4: charge.payment_method_details.card.last4,
                    expiryMonth: charge.payment_method_details.card.exp_month,
                    expiryYear: charge.payment_method_details.card.exp_year
                };
            }
        } catch (err) {
            console.error("Error fetching charge details:", err);
        }
    }

    // Determine transaction type
    const isFirstInvoice = invoice.billing_reason === "subscription_create";
    const transactionType = isFirstInvoice ? "subscription_created" : "subscription_renewed";

    await Model.transaction.create({
        userId: userSubscription.userId,
        stripeCustomerId: invoice.customer,
        stripeSubscriptionId: invoice.subscription,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: invoice.payment_intent,
        stripeChargeId: invoice.charge,
        stripeEventId: event.id,
        rawEventType: event.type,
        type: transactionType,
        status: "succeeded",
        amount: invoice.amount_paid,
        currency: invoice.currency,
        stripePriceId: invoice.lines?.data[0]?.price?.id,
        stripeProductId: invoice.lines?.data[0]?.price?.product,
        productName: invoice.lines?.data[0]?.description,
        periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
        paymentMethod: paymentMethodDetails,
        invoiceUrl: invoice.hosted_invoice_url,
        invoicePdf: invoice.invoice_pdf,
        description: `Payment for ${invoice.lines?.data[0]?.description || "subscription"}`
    });
};

/**
 * Handle invoice.payment_succeeded
 */
const handleInvoicePaymentSucceeded = async (event) => {
    const invoice = event.data.object;
    console.log(`Invoice payment succeeded: ${invoice.id}`);

    if (!invoice.subscription) return;

    // Update subscription status to active if it was past_due
    await Model.userSubscription.findOneAndUpdate(
        {
            stripeSubscriptionId: invoice.subscription,
            status: "past_due"
        },
        { status: "active" }
    );
};

/**
 * Handle invoice.payment_failed
 */
const handleInvoicePaymentFailed = async (event) => {
    const invoice = event.data.object;
    console.log(`Invoice payment failed: ${invoice.id}`);

    if (!invoice.subscription) return;

    const userSubscription = await Model.userSubscription.findOne({
        stripeSubscriptionId: invoice.subscription
    });

    if (!userSubscription) return;

    // Update subscription status
    await Model.userSubscription.findOneAndUpdate(
        { stripeSubscriptionId: invoice.subscription },
        { status: "past_due" }
    );

    // Get failure details
    let failureCode = null;
    let failureMessage = null;
    if (invoice.payment_intent) {
        try {
            const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent);
            failureCode = paymentIntent.last_payment_error?.code;
            failureMessage = paymentIntent.last_payment_error?.message;
        } catch (err) {
            console.error("Error fetching payment intent:", err);
        }
    }

    await Model.transaction.create({
        userId: userSubscription.userId,
        stripeCustomerId: invoice.customer,
        stripeSubscriptionId: invoice.subscription,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: invoice.payment_intent,
        stripeEventId: event.id,
        rawEventType: event.type,
        type: "payment_failed",
        status: "failed",
        amount: invoice.amount_due,
        currency: invoice.currency,
        stripePriceId: invoice.lines?.data[0]?.price?.id,
        stripeProductId: invoice.lines?.data[0]?.price?.product,
        periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
        failureCode: failureCode,
        failureMessage: failureMessage,
        description: `Payment failed for ${invoice.lines?.data[0]?.description || "subscription"}`
    });
};

/**
 * Handle invoice.upcoming
 * Triggered a few days before the next invoice
 */
const handleInvoiceUpcoming = async (event) => {
    const invoice = event.data.object;
    console.log(`Upcoming invoice for subscription: ${invoice.subscription}`);
    // Optionally notify user about upcoming charge
};

/**
 * Handle invoice.finalized
 */
const handleInvoiceFinalized = async (event) => {
    const invoice = event.data.object;
    console.log(`Invoice finalized: ${invoice.id}`);
    // Invoice is ready to be paid
};

/**
 * Handle payment_intent.succeeded
 */
const handlePaymentIntentSucceeded = async (event) => {
    const paymentIntent = event.data.object;
    console.log(`Payment intent succeeded: ${paymentIntent.id}`);
    // Usually handled via invoice.paid for subscriptions
};

/**
 * Handle payment_intent.payment_failed
 */
const handlePaymentIntentFailed = async (event) => {
    const paymentIntent = event.data.object;
    console.log(`Payment intent failed: ${paymentIntent.id}`);
    // Usually handled via invoice.payment_failed for subscriptions
};

/**
 * Handle charge.refunded
 */
const handleChargeRefunded = async (event) => {
    const charge = event.data.object;
    console.log(`Charge refunded: ${charge.id}`);

    // Find the original transaction
    const originalTransaction = await Model.transaction.findOne({
        stripeChargeId: charge.id
    });

    if (originalTransaction) {
        // Update original transaction
        await Model.transaction.findByIdAndUpdate(originalTransaction._id, {
            amountRefunded: charge.amount_refunded,
            status: charge.refunded ? "refunded" : originalTransaction.status
        });

        // Create refund transaction record
        await Model.transaction.create({
            userId: originalTransaction.userId,
            stripeCustomerId: charge.customer,
            stripeChargeId: charge.id,
            stripeEventId: event.id,
            rawEventType: event.type,
            type: "refund",
            status: "succeeded",
            amount: charge.amount_refunded,
            currency: charge.currency,
            description: `Refund for charge ${charge.id}`,
            receiptUrl: charge.receipt_url
        });
    }
};

/**
 * Handle customer.updated
 */
const handleCustomerUpdated = async (event) => {
    const customer = event.data.object;
    console.log(`Customer updated: ${customer.id}`);
    // Optionally sync customer data
};

module.exports = {
    handleWebhook
};
