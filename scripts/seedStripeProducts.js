const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const StripeProduct = require('../model/StripeProduct');
const StripePrice = require('../model/StripePrice');

const MONGO_URL = process.env.MONGO_URL;

const seedData = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGO_URL);
        console.log('Connected to MongoDB');

        // Product data
        const productData = {
            stripeProductId: 'prod_TTEd2Ylnx5SUmt',
            name: 'Appraiser Assistant Pro',
            description: 'Full access to all premium features including car search, comparison tools, and PDF reports.',
            active: true
        };

        // Price data
        const pricesData = [
            {
                stripePriceId: 'price_1SWIAYBJxqoCxtlpuXal2WbZ',
                stripeProductId: 'prod_TTEd2Ylnx5SUmt',
                unitAmount: 1000, // $10.00/month
                currency: 'usd',
                interval: 'month',
                intervalCount: 1,
                active: true
            },
            {
                stripePriceId: 'price_1SWIAYBJxqoCxtlpZ4SGoBQn',
                stripeProductId: 'prod_TTEd2Ylnx5SUmt',
                unitAmount: 10000, // $100.00/year
                currency: 'usd',
                interval: 'year',
                intervalCount: 1,
                active: true
            }
        ];

        // Upsert product
        const product = await StripeProduct.findOneAndUpdate(
            { stripeProductId: productData.stripeProductId },
            productData,
            { upsert: true, new: true }
        );
        console.log('Product created/updated:', product.name);

        // Upsert prices
        for (const priceData of pricesData) {
            const price = await StripePrice.findOneAndUpdate(
                { stripePriceId: priceData.stripePriceId },
                priceData,
                { upsert: true, new: true }
            );
            console.log(`Price created/updated: ${price.stripePriceId} (${price.interval}ly - $${price.unitAmount / 100})`);
        }

        console.log('\nSeeding completed successfully!');
        console.log('\nProduct ID:', productData.stripeProductId);
        console.log('Monthly Price ID:', pricesData[0].stripePriceId);
        console.log('Yearly Price ID:', pricesData[1].stripePriceId);

    } catch (error) {
        console.error('Error seeding data:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
};

seedData();
