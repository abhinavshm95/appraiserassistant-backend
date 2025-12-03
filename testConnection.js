const Mongoose = require("mongoose");
const User = require("./model/User");
require("dotenv").config();

const MONGO_URL = process.env.MONGO_URL;

console.log("Attempting to connect to:", MONGO_URL);

Mongoose.connect(MONGO_URL)
    .then(async () => {
        console.log("Connected to MongoDB");
        console.log("Database name:", Mongoose.connection.db.databaseName);
        console.log("Connection host:", Mongoose.connection.host);

        // Find admin user
        const admin = await User.findOne({ email: "admin@appraiserassistant.com" });

        if (admin) {
            console.log("\nAdmin user found in MongoDB:");
            console.log("Has password:", !!admin.password);
            console.log("Password length:", admin.password ? admin.password.length : 0);
        } else {
            console.log("\nNo admin user found in MongoDB");
        }

        // List all users
        const allUsers = await User.find({});
        console.log("\nTotal users in MongoDB:", allUsers.length);
        allUsers.forEach(user => {
            console.log(`- ${user.email} (has password: ${!!user.password})`);
        });

        process.exit(0);
    })
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
