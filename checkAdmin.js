const Mongoose = require("mongoose");
const User = require("./model/User");

// Connect to MongoDB
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/appraiserassistant";

Mongoose.connect(MONGO_URL)
    .then(async () => {
        console.log("Connected to MongoDB");

        // Find admin user
        const admin = await User.findOne({ email: "admin@appraiserassistant.com" });

        if (admin) {
            console.log("Admin user found:");
            console.log(JSON.stringify(admin, null, 2));
        } else {
            console.log("No admin user found");
        }

        process.exit(0);
    })
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
