const dotenv = require("dotenv");
const path = require("path");

const result = dotenv.config({ path: path.join(__dirname, '.env') });

if (result.error) {
  console.error("Error loading .env file:", result.error);
  process.exit(1);
}

console.log("Dotenv loaded successfully");

const Mongoose = require("mongoose");
const User = require("./model/User");
const { securePassword } = require("./universalFunction/universalFunction");

// Connect to MongoDB
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/appraiserassistant";

console.log("MONGO_URL from env:", process.env.MONGO_URL);
console.log("MONGO_URL to use:", MONGO_URL);


Mongoose.connect(MONGO_URL)
    .then(async () => {
        console.log("Connected to MongoDB");

        // Check if admin already exists and delete it to recreate with proper password
        const existingAdmin = await User.findOne({ email: "admin@appraiserassistant.com" });

        if (existingAdmin) {
            console.log("Existing admin user found. Deleting to recreate with proper password...");
            await User.deleteOne({ email: "admin@appraiserassistant.com" });
        }

        // Create new admin user
        const hashedPassword = await securePassword("admin@123");
        const admin = new User({
            name: "admin",
            email: "admin@appraiserassistant.com",
            password: hashedPassword,
            role: "admin"
        });

        await admin.save();
        console.log("Admin user created successfully");
        console.log("Email: admin@appraiserassistant.com");
        // admin@appraiserassistant.com
        console.log("Password: admin@123");
        process.exit(0);
    })
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
