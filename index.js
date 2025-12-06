require("dotenv").config();
const express = require("express");
const connectDb = require("./connect/connection.js");
const cors = require("cors");
const route = require("./Route.js");
const stripeWebhookRoute = require("./Route/stripeWebhookRoute.js");
const app = express();
const path=require("path")
const ejs = require('ejs');
const PORT = process.env.PORT || 5000;
const cookieParser = require("cookie-parser");

// Middleware to ensure DB connection before handling requests
app.use(async (req, res, next) => {
  try {
    await connectDb();
    next();
  } catch (error) {
    console.error("Database connection failed:", error);
    res.status(500).json({ error: "Database connection failed" });
  }
});

app.use(cookieParser());

// CORS configuration - update with your actual frontend URLs
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:5001',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins in development, restrict in production as needed
    }
  },
  credentials: true
}));

/**
 * IMPORTANT: Stripe webhook route must be registered BEFORE express.json() middleware
 * Stripe requires the raw body (not parsed) for signature verification
 */
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookRoute);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use("/upload",express.static("upload"))
app.use("/api", route);
app.get("/", (req, res)=> res.json({ message: "Welcome to the Appraiser Assistant API." }))
app.set('view engine', 'ejs');
app.set('views', path.resolve(__dirname, './views'))

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT,() => {
    console.log(`Server is Running at PORT ${PORT}`);
  });
}

// Export for Vercel serverless
module.exports = app;

