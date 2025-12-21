const dotenv = require("dotenv");
const path = require("path");
const Mongoose = require("mongoose");
const User = require("../model/User");
const UserSubscription = require("../model/UserSubscription");

const envPath = path.join(__dirname, "../.env");
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error("Error loading .env file:", result.error);
  // Continue anyway as process.env might be populated
}

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/appraiserassistant";

const migrateData = async () => {
  try {
    await Mongoose.connect(MONGO_URL);
    console.log("Connected to MongoDB for migration");

    // Find all admins and managers
    const users = await User.find({ role: { $in: ["admin", "manager"] } });
    console.log(`Found ${users.length} admin/manager users to check.`);

    let migratedCount = 0;

    for (const user of users) {
      // Find their subscription
      const subscription = await UserSubscription.findOne({ userId: user._id });

      if (subscription) {
        console.log(`Processing user: ${user.email} (${user.role})`);

        // If subscription has stripeCustomerId and user doesn't, migrate it
        if (subscription.stripeCustomerId && !user.stripeCustomerId) {
          console.log(`  Migrating stripeCustomerId: ${subscription.stripeCustomerId}`);
          user.stripeCustomerId = subscription.stripeCustomerId;
          await user.save();
        } else if (user.stripeCustomerId) {
          console.log(`  User already has stripeCustomerId: ${user.stripeCustomerId}`);
        }

        // Delete the incorrect subscription record
        console.log(`  Deleting UserSubscription record: ${subscription._id}`);
        await UserSubscription.findByIdAndDelete(subscription._id);
        migratedCount++;
      }
    }

    console.log(`Migration completed. Processed ${migratedCount} records.`);
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

migrateData();
