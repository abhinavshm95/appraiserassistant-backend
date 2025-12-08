const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const StripeProduct = require('../model/StripeProduct');
const StripePrice = require('../model/StripePrice');

const MONGO_URL = process.env.MONGO_URL;

const checkProducts = async () => {
    try {
        await mongoose.connect(MONGO_URL);
        console.log('Connected to MongoDB');
        console.log('MongoDB URL:', MONGO_URL.substring(0, 50) + '...');

        const products = await StripeProduct.find({});
        const prices = await StripePrice.find({});

        console.log('\n========================================');
        console.log('Products in database:', products.length);
        console.log('========================================\n');

        products.forEach(p => {
            console.log(`Name: ${p.name}`);
            console.log(`  ID: ${p._id}`);
            console.log(`  Stripe Product ID: ${p.stripeProductId}`);
            console.log(`  Active: ${p.active}`);
            console.log('');
        });

        console.log('\n========================================');
        console.log('Prices in database:', prices.length);
        console.log('========================================\n');

        prices.forEach(p => {
            console.log(`Price ID: ${p.stripePriceId}`);
            console.log(`  Product ID: ${p.stripeProductId}`);
            console.log(`  Amount: $${p.unitAmount / 100}`);
            console.log(`  Interval: ${p.interval}`);
            console.log(`  Active: ${p.active}`);
            console.log('');
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
};

checkProducts();
