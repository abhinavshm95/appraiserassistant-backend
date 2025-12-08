const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const StripeProduct = require('../model/StripeProduct');
const StripePrice = require('../model/StripePrice');

const MONGO_URL = process.env.MONGO_URL;

const newPlans = [
    {
        name: 'Basic',
        description: 'Essential tools for individual appraisers. Includes car search and basic comparison features.',
        monthlyPrice: 600, // $6.00
        yearlyPrice: 6000, // $60.00
        features: ['car_search', 'basic_comparison'],
        tier: 1
    },
    {
        name: 'Growth',
        description: 'Advanced features for growing professionals. Includes PDF reports and salvage listings.',
        monthlyPrice: 800, // $8.00
        yearlyPrice: 8000, // $80.00
        features: ['car_search', 'comparison_tools', 'pdf_reports', 'salvage_listings'],
        tier: 2
    }
];

const createPlansInStripe = async () => {
    try {
        await mongoose.connect(MONGO_URL);
        console.log('Connected to MongoDB');

        const createdProducts = [];

        for (const plan of newPlans) {
            console.log(`\nCreating ${plan.name} plan in Stripe...`);

            // Create product in Stripe
            const product = await stripe.products.create({
                name: `Appraiser Assistant ${plan.name}`,
                description: plan.description,
                metadata: {
                    tier: plan.tier.toString(),
                    features: plan.features.join(',')
                }
            });
            console.log(`  Product created: ${product.id}`);

            // Create monthly price in Stripe
            const monthlyPrice = await stripe.prices.create({
                product: product.id,
                unit_amount: plan.monthlyPrice,
                currency: 'usd',
                recurring: {
                    interval: 'month',
                    interval_count: 1
                },
                metadata: {
                    plan_name: plan.name,
                    billing_period: 'monthly'
                }
            });
            console.log(`  Monthly price created: ${monthlyPrice.id} ($${plan.monthlyPrice / 100}/month)`);

            // Create yearly price in Stripe
            const yearlyPrice = await stripe.prices.create({
                product: product.id,
                unit_amount: plan.yearlyPrice,
                currency: 'usd',
                recurring: {
                    interval: 'year',
                    interval_count: 1
                },
                metadata: {
                    plan_name: plan.name,
                    billing_period: 'yearly'
                }
            });
            console.log(`  Yearly price created: ${yearlyPrice.id} ($${plan.yearlyPrice / 100}/year)`);

            // Save product to MongoDB
            const savedProduct = await StripeProduct.findOneAndUpdate(
                { stripeProductId: product.id },
                {
                    stripeProductId: product.id,
                    name: product.name,
                    description: product.description,
                    active: true,
                    metadata: new Map(Object.entries(product.metadata || {}))
                },
                { upsert: true, new: true }
            );
            console.log(`  Product saved to MongoDB: ${savedProduct.name}`);

            // Save monthly price to MongoDB
            await StripePrice.findOneAndUpdate(
                { stripePriceId: monthlyPrice.id },
                {
                    stripePriceId: monthlyPrice.id,
                    stripeProductId: product.id,
                    unitAmount: monthlyPrice.unit_amount,
                    currency: monthlyPrice.currency,
                    interval: monthlyPrice.recurring.interval,
                    intervalCount: monthlyPrice.recurring.interval_count,
                    active: true,
                    metadata: new Map(Object.entries(monthlyPrice.metadata || {}))
                },
                { upsert: true, new: true }
            );
            console.log(`  Monthly price saved to MongoDB`);

            // Save yearly price to MongoDB
            await StripePrice.findOneAndUpdate(
                { stripePriceId: yearlyPrice.id },
                {
                    stripePriceId: yearlyPrice.id,
                    stripeProductId: product.id,
                    unitAmount: yearlyPrice.unit_amount,
                    currency: yearlyPrice.currency,
                    interval: yearlyPrice.recurring.interval,
                    intervalCount: yearlyPrice.recurring.interval_count,
                    active: true,
                    metadata: new Map(Object.entries(yearlyPrice.metadata || {}))
                },
                { upsert: true, new: true }
            );
            console.log(`  Yearly price saved to MongoDB`);

            createdProducts.push({
                name: plan.name,
                productId: product.id,
                monthlyPriceId: monthlyPrice.id,
                yearlyPriceId: yearlyPrice.id
            });
        }

        console.log('\n========================================');
        console.log('All plans created successfully!');
        console.log('========================================\n');

        console.log('Summary:');
        createdProducts.forEach(p => {
            console.log(`\n${p.name}:`);
            console.log(`  Product ID: ${p.productId}`);
            console.log(`  Monthly Price ID: ${p.monthlyPriceId}`);
            console.log(`  Yearly Price ID: ${p.yearlyPriceId}`);
        });

    } catch (error) {
        console.error('Error creating plans:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
};

createPlansInStripe();
